# Chatbot Status — What's Done / What's Missing

## What's done (chatbot side)

Full chat pipeline is wired end-to-end:

- User message → orchestrator → 18 tools → SSE events → frontend renders them
- Multi-turn post creation flow (platforms → timing → approval → push() + bare slot)
- Cron correctly handles bare slots: postCandidateId: null → popTop() at trigger time
- All event types rendered in UI: draft_preview, scheduled_list, action_result, confirm, proposal, text, status, error
- Array-first architecture: every tool accepts arrays; single post = topics: ["x"]

### All 18 tools implemented:
- schedule_post, list_scheduled_posts, cancel_pending_draft, clarify_with_user
- cancel_scheduled_post, reschedule_post, pause_posting, resume_posting, rollback_published_post
- analytics_snapshot, research_topic, scrape_competitor
- get_profile, update_business_profile, set_strategy_optout
- save_memory, recall_memory, get_older_history
- search_knowledge

---

## What's missing / broken

### 1. Image generation — feature is a stub
The flow collects `wantsImage: true` and stores it in collectedData, but DirectActionHandler never calls any image API. The `mediaUrl` on every post is always undefined. Was never implemented in any slice.

### 2. Knowledge base is empty
`search_knowledge` tool queries `ap_knowledge_chunk` (table exists in schema), but there are no rows. When users ask "what can you do?", the tool returns "no results" every time. The `knowledge/autopilot.md` file was created but its content was never chunked + embedded into the table.

### 3. ap_knowledge_chunk has no seeder
No script or service reads `knowledge/*.md`, splits into chunks, embeds them via OpenAI, and inserts into `ap_knowledge_chunk`. Without this, `search_knowledge` is dead.

### 4. Phases 5–9 are untouched
Reports, Telegram, browser automation, article ingestion, cost reconciliation — all unchecked in the plan.

---

## Recommended priority order

1. **Knowledge base seeder** — one-time script: read knowledge/*.md → chunk → embed → insert into ap_knowledge_chunk. ~50 lines. Without it, "what can you do?" always fails.
2. **Image generation** — next visible feature gap after knowledge base.
3. **Phases 5–9** — longer term.

---

---

# Previous: Refactoring Plan: Universal Array Operations + Decoupled Stack/Slots
# Constraints: App is in development. Full rewrites allowed. No migration needed — just update schema + run prisma db push.

---

## What STAYS the same (do not touch)

- `ap_post_candidate` schema — stack table is correct
- `ap_scheduled_slot` schema — slot table is correct
- `push()`, `popTop()`, `expire()`, `depth()` stack primitives — correct as-is
- `TriggerDueSlots` cron — already pops from stack at fire time
- `SlotSchedulerService` cadence flow — already creates bare slots
- `EvergreenPoolService` — unrelated
- All Phase 3–4 agents: copywriter, fan_out, researcher, analyzer
- Read-only tools: `list_scheduled_posts`, `analytics_snapshot`, `research_topic`, `scrape_competitor`, `get_profile`, `recall_memory`, `get_older_history`, `search_knowledge`

---

## Database Changes

### `apPendingAction` table — rewrite `collectedData` shape

No schema column change needed (it's already `Json`). The shape stored inside changes.

New `collectedData` structure (replace the old one entirely):
```ts
{
  // Collected during conversation
  topics?: string[]          // one or many topics
  content?: string           // verbatim text if user typed exact wording
  platforms?: string[]       // target platforms
  startTime?: string         // ISO — when first post goes out
  intervalMinutes?: number   // minutes between posts (default 60)
  wantsImage?: boolean

  // Built at draft-generation step
  postStack?: PostEntry[]    // [{topic, platform, content, hashtags?, mediaUrl?}]
  times?: string[]           // parallel ISO — postStack[i] goes at times[i]

  // Optional image (shared across all posts in batch)
  imageUrl?: string
}
```

`waitingFor` values — simplify to 4 states (remove `series_approval`):
- `'platforms'` — waiting for which platforms
- `'timing'`    — waiting for when (startTime + optional interval)
- `'approval'`  — draft generated, waiting for user confirm/cancel
- *(remove `image_consent` state — fold into the flow as auto-detect only)*

Note: `image_consent` state can be removed because image availability is deterministic.
If image gen is configured → automatically offer it in the draft preview card (checkbox or toggle),
not a separate conversation turn. This simplifies the state machine from 4 → 3 states.

### No other schema changes needed.

---

## Code Rewrites — Slice by Slice

---

### Slice R.1 — Rewrite `DirectActionData` type (intent_parser.ts)

**File:** `libraries/nestjs-libraries/src/autopilot/agents/intent_parser.ts`

Replace scalar `topic?` with `topics?: string[]`.
Remove `publishImmediately`, `scheduleAt`, `countPerPlatform` — these are now derived from `startTime` + `intervalMinutes`.

New `DirectActionData`:
```ts
{
  topics?: string[]
  content?: string
  platforms?: string[]
  startTime?: string         // natural language or ISO
  intervalMinutes?: number
  immediate?: boolean        // true only if user said "now"/"asap"
  wantsImage?: boolean
}
```

---

### Slice R.2 — Rewrite `DirectActionHandler` (direct_action_handler.ts)

**File:** `libraries/nestjs-libraries/src/autopilot/chat/direct_action_handler.ts`

Full rewrite of the class. Key changes:

**`CollectedData` interface** — matches the new `collectedData` shape above.

**`startFlow()`**
- Accept `DirectActionData` (already updated in R.1)
- Normalize `topics` from input (if `content` provided, treat as single-entry `topics: [content]`)
- Call `_advance()`

**`_advance()` — 3 steps only (removed image_consent step)**

Step 1: platforms missing → ask
Step 2: startTime missing AND not immediate → ask ("When should these go out?")
Step 3: approval
  - Generate `postStack[]` via copywriter (one per topic × platform)
  - Build `times[]` (startTime + topicIndex × intervalMinutes)
  - If image gen available → include `wantsImage` toggle in the draft_preview card (frontend handles it), not a separate turn
  - Emit `draft_preview` with `posts[]` + `imageUrl?`

**`confirmApproval()` — rewrite**

```
for i, post in postStack:
  push(db, orgId, post.platform, post.content, {
    priority: 100,
    source: 'chat_direct_action',
    metadata: { hashtags: post.hashtags ?? [], mediaUrl: post.mediaUrl }
  })

for i, time in times:
  apScheduledSlot.create({
    organizationId: orgId,
    platform: postStack[i].platform,
    scheduledAt: new Date(time),
    status: 'PENDING',
    postCandidateId: null    // bare — cron fills at fire time
  })

delete apPendingAction for org
return { ok: true, message: "Queued N posts — first going out at <time>." }
```

**`cancelPost()`** — unchanged (deletes pending action).

**`continuePending()`** — update to read `topics`, `startTime`, `intervalMinutes` instead of old scalar fields.

---

### Slice R.3 — Rewrite `ChatDraftPreviewEvent` type (types.ts + chat.service.ts)

**File:** `libraries/nestjs-libraries/src/autopilot/orchestrator/types.ts`

Replace:
```ts
// OLD
export type ChatDraftPreviewEvent = {
  type: 'draft_preview';
  pendingActionId: string;
  drafts: Array<{ platform: string; content: string; hashtags?: string[] }>;
  imageUrl?: string;
  publishAt: string;          // ← single time, wrong
};
```

With:
```ts
// NEW
export type ChatDraftPreviewEvent = {
  type: 'draft_preview';
  pendingActionId: string;
  posts: Array<{
    topic: string;
    platform: string;
    content: string;
    hashtags?: string[];
    scheduledAt: string;      // per-post ISO time
    mediaUrl?: string;
  }>;
  imageUrl?: string;
};
```

Delete `ChatSeriesPreviewEvent` entirely — it's merged into `ChatDraftPreviewEvent`.

**File:** `libraries/nestjs-libraries/src/autopilot/chat/chat.service.ts`

Remove `ChatSeriesPreviewEvent` from the union type.

---

### Slice R.4 — Rewrite `schedule_post` tool

**File:** `libraries/nestjs-libraries/src/autopilot/orchestrator/tools/schedule_post.ts`

New input schema:
```ts
{
  topics:          string[]   // always an array — single post = ["the topic"]
  platforms:       string[]   // which platforms
  startTime?:      string     // natural language time for first post
  immediate?:      boolean    // true only if user said "now"/"asap"
  intervalMinutes?: number    // gap between posts (default 60, irrelevant if topics.length=1)
  content?:        string     // verbatim text (only if user provided exact wording)
  wantsImage?:     boolean
}
```

Tool parses `startTime` via `parseTimeExpression`, builds `DirectActionData` with arrays,
calls `DirectActionHandler.startFlow()`.

Single post is just `topics: ["some topic"]` — no special case.

---

### Slice R.5 — Rewrite management tools (arrays in, loop internally)

**`cancel_scheduled_post.ts`**
```ts
input: { slotIds: string[]; reason?: string }
// loops: for each id → update status=CANCELLED + audit metadata
// observation: "Cancelled N of M slots." (some may already be non-PENDING)
```

**`reschedule_post.ts`**
```ts
input: { slotIds: string[]; times: string[]; reason?: string }
// validate: slotIds.length === times.length (hard error if not)
// loops: for each i → parse times[i] → update slot scheduledAt
// observation: "Rescheduled N slots."
```

**`rollback_published_post.ts`**
```ts
input: { publishedPostIds: string[]; reason?: string }
// loops: for each id → handleRollback(ctx, { publishedPostId: id, reason })
// observation: "Rolled back N posts."
```

**`pause_posting.ts`**
```ts
input: { platforms?: string[]; durationDays?: number; until?: string }
// platforms omitted → pause all active platforms
// loops: for each platform → CadenceConfigService.pause()
```

**`resume_posting.ts`**
```ts
input: { platforms?: string[] }
// platforms omitted → resume all paused platforms
// loops: for each platform → CadenceConfigService.resume()
```

---

### Slice R.6 — Delete `create_post_series.ts`

- Delete `libraries/nestjs-libraries/src/autopilot/orchestrator/tools/create_post_series.ts`
- Remove from `tools/index.ts`
- Remove from `orchestrator/index.ts`
- Remove `ChatSeriesPreviewEvent` from `types.ts` (done in R.3)
- Remove `series_preview` SSE case from frontend (done in R.8)

---

### Slice R.7 — Update `state-snapshot.ts`

**File:** `libraries/nestjs-libraries/src/autopilot/orchestrator/state-snapshot.ts`

Rewrite `describeCollected()` to read new shape:
```
topics[]   → "topics=word1/word2/... (N posts)"
platforms  → unchanged
startTime  → "timing=<formatted>"
postStack  → "drafts_ready=N" if array already built
```

---

### Slice R.8 — Rewrite `DraftPreviewBubble` in frontend

**File:** `apps/frontend/src/components/autopilot/chat-layout.tsx`

**Type change:**
```ts
type DraftPreviewMsg = {
  id: string;
  role: 'draft_preview';
  pendingActionId: string;
  posts: Array<{
    topic: string;
    platform: string;
    content: string;
    hashtags?: string[];
    scheduledAt: string;
  }>;
  imageUrl?: string;
  decided: boolean;
  confirmStatus?: 'loading' | 'done';
  confirmMessage?: string;
};
```

**`DraftPreviewBubble` component:**
- Render scrollable list — one row per post: `[platform] [topic] [content truncated] [time]`
- Single post (N=1) renders as a single-row list — same component, no branching
- Confirm/Cancel buttons at the bottom apply to all posts in the batch

**Remove:**
- `SeriesPreviewMsg` type
- `series_preview` SSE handler case
- `handleSeriesDecision` callback (if it was added)

---

### Slice R.9 — Rewrite system prompt in orchestrator

**File:** `libraries/nestjs-libraries/src/autopilot/agents/orchestrator.ts`

Updated rules:
1. Pending flow merge — unchanged
2. `schedule_post` always takes `topics: string[]` — even one post: `topics: ["the topic"]`
3. For a series: `topics: ["word1","word2",...,"word7"]`, `startTime: "next hour"`, `intervalMinutes: 60`
4. There is NO `create_post_series` tool — `schedule_post` handles all counts
5. Cancel: `slotIds: ["id1","id2"]` — pass all IDs at once, not one call per post
6. Reschedule: `slotIds` and `times` must be equal-length parallel arrays
7. After `draft_preview` emitted → turn is OVER, do not add text reply

---

## Slice Execution Order

```
R.1  (intent_parser types)
 ↓
R.2  (DirectActionHandler full rewrite)
 ↓
R.3  (event type rewrite — types.ts + chat.service.ts)
 ↓
R.4  (schedule_post rewrite)   ─┐
R.5  (management tools arrays)  ├─ parallel after R.3
R.6  (delete create_post_series)┘
 ↓
R.7  (state-snapshot update)
R.8  (frontend DraftPreviewBubble rewrite)
 ↓
R.9  (system prompt update)
```

---

## Testing Checkpoints (after each slice)

| After | Check |
|-------|-------|
| R.2 | `confirmApproval` creates bare slots (postCandidateId IS NULL in DB) |
| R.2 | Stack has new candidates at priority 100 |
| R.3 | SSE stream carries `posts[]` with per-entry `scheduledAt` |
| R.4 | Single "post about X tomorrow 9am" → `topics:["X"]`, one candidate + one slot |
| R.4 | "7 posts one per hour" → 7 candidates + 7 slots at correct times |
| R.5 | "Cancel slots A, B, C" → all 3 cancelled in one tool call |
| R.8 | DraftPreviewBubble renders correctly for N=1 and N=7 |
| R.9 | LLM never calls `create_post_series` (tool doesn't exist) |

---

## Total Files to Touch

```
libraries/nestjs-libraries/src/autopilot/agents/intent_parser.ts           (R.1)
libraries/nestjs-libraries/src/autopilot/chat/direct_action_handler.ts     (R.2)
libraries/nestjs-libraries/src/autopilot/orchestrator/types.ts             (R.3)
libraries/nestjs-libraries/src/autopilot/chat/chat.service.ts              (R.3)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/schedule_post.ts       (R.4)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/cancel_scheduled_post.ts (R.5)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/reschedule_post.ts    (R.5)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/rollback_published_post.ts (R.5)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/pause_posting.ts     (R.5)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/resume_posting.ts    (R.5)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/create_post_series.ts (R.6 — DELETE)
libraries/nestjs-libraries/src/autopilot/orchestrator/tools/index.ts            (R.6)
libraries/nestjs-libraries/src/autopilot/orchestrator/index.ts                  (R.6)
libraries/nestjs-libraries/src/autopilot/orchestrator/state-snapshot.ts         (R.7)
apps/frontend/src/components/autopilot/chat-layout.tsx                          (R.8)
libraries/nestjs-libraries/src/autopilot/agents/orchestrator.ts                 (R.9)
```

16 files total. No schema changes. No new files (one deletion).
```
