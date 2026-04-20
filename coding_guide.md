# Coding Guide — AI Social Media Autopilot

> **This is not the project plan.** The product scope lives in [project_plan.md](project_plan.md). This file is the **execution map** for Claude Code: modular slices, status tracking, and repo hints so work can resume without re-reading the codebase.

---

## How to use this file

**Every Claude Code session follows the same loop:**

1. Read this file top to bottom (it is the only file that needs re-reading each session).
2. Check §Status tracker → pick the next unchecked slice (or the one the user named).
3. Read §Architecture cheat sheet for paths/conventions — do **not** re-explore the repo if the answer is here.
4. **For every prior-slice service your slice will call:** read that service's actual source file and confirm the exact exported function signatures before writing any code. The file is authoritative; descriptions in this guide may lag.
5. Read the slice definition. If it cites sections of `project_plan.md`, read only those sections.
6. Execute the slice. Do **only** that slice.
7. Update this file (see §Self-tracking protocol).
8. Stop. Hand back to the user.

## Principles for Claude Code

- **One slice per session.** Never bundle slices. If a slice finishes fast and the user says "keep going," treat the next slice as a new session: update tracker, re-read the next slice definition, then proceed.
- **Do not refactor adjacent code** unless the slice explicitly calls for it.
- **Do not add features beyond the slice's "Definition of done."**
- **If a slice is ambiguous, stop and ask.** Do not infer.
- **If a dependency is unmet,** do not do the dependency — stop and tell the user which slice must run first.
- **If you discover a blocker** (missing library, broken build, architectural mismatch), record it in §Blockers and stop.
- **If you learn something reusable** about the repo (paths, conventions, existing helpers), append it to §Architecture cheat sheet so the next session doesn't re-derive it.
- **Never assume a prior slice's API from descriptions alone** — always read the actual file. Descriptions drift; source code doesn't.
- **If your slice adds a NestJS injectable service**, verify it is listed in `AutopilotModule` (or the relevant module's) `providers` and `exports` before marking done. A service that isn't exported cannot be injected by later slices.
- **Keep the build green.** Run typecheck/tests for touched packages when feasible. If setup is unclear, do the minimum smoke check.
- **Never mark a slice done unless its Definition of done is met.** If partially done, leave unchecked, write what's complete in §Build log, and describe remaining work in §Carry-over.

## Self-tracking protocol

After completing a slice, update **exactly these sections** of this file before finishing:

1. **§Status tracker** — check the box for the completed slice.
2. **§Build log** — append one line: `YYYY-MM-DD | slice-id | outcome | files-touched`. Keep it dense.
3. **§Architecture cheat sheet** — add any repo path, helper, convention, or gotcha worth preserving. Prefer updating existing entries over adding new ones. For any new service API your slice exports, record the **exact exported function signatures** (parameter names + types + return type), not just the file path — this is what prevents API drift in later sessions.
4. **§Carry-over** — if anything was left undone, write it here. Clear it when picked up.
5. **§Blockers** — if blocked, write here. Clear when resolved.

Then commit with message `slice(<id>): <short summary>` (see §Commit style).

---

## Status tracker

Format: `[ ] slice-id — one-line goal`. Check the box when Definition of done is met.

### Phase 0 — Foundation
- [x] 0.0 — Map repo + populate Architecture cheat sheet
- [x] 0.1 — Add env vars and validation for autopilot module
- [x] 0.2 — Create empty module directory structure per §Module layout
- [x] 0.3 — Skill registry core types (no skills yet)
- [x] 0.4 — `tiers.ts` scaffold with one MVP tier (Free)
- [x] 0.5 — `skill-costs.ts` scaffold
- [x] 0.6 — Agent base types (system prompt, scoped skills, ctx)
- [x] 0.7 — Prisma: `credit_ledger` + migration
- [x] 0.8 — Prisma: `activity_log` + migration
- [x] 0.9 — Prisma: `capability_gaps` + migration
- [x] 0.10 — Prisma: `chat_messages` + migration
- [x] 0.11 — Encryption utility for per-tenant secrets
- [x] 0.12 — Prisma: `platform_keys` + CRUD service
- [x] 0.13 — Pre-flight pipeline skeleton (plan gate → credit gate → dispatch)
- [x] 0.14 — Activity logger helper + credit debit helper
- [x] 0.15 — Capability gap logger helper
- [x] 0.16 — Vercel AI SDK wiring + provider selection helper
- [x] 0.17 — Prisma: `discounts` + `discount_applications` + migration
- [x] 0.18 — Discount module (origin-agnostic apply/list/validate)
- [x] 0.19 — PayPal webhook endpoint scaffolding (signature verify, no-op handlers)
- [x] 0.20 — Prisma: `subscriptions` + `invoices` + migration

### Phase 1 — Chat Core
- [x] 1.1 — Prisma: `business_profile`, `growth_rules` + migration
- [x] 1.2 — Prisma: `config_change_proposals` + migration
- [x] 1.3 — Intent parser agent skeleton (classify + propose, no CRUD)
- [x] 1.4 — Proposal → confirm → apply pipeline
- [x] 1.5 — Enable `pgvector` extension + `memory_vectors` table + migration
- [x] 1.6 — Memory read/write service (structured + vector)
- [x] 1.7 — Memorist agent skeleton
- [x] 1.8 — Chat ingress endpoint (web source), writes `chat_messages`, routes to intent parser
- [x] 1.9 — Frontend: chatbot-primary layout scaffold (no agent wiring yet)
- [x] 1.10 — Frontend: card-select component for confirm UX
- [x] 1.11 — Frontend: wire chat UI to ingress endpoint (streamed response)
- [x] 1.12 — Onboarding first-run: seed `business_profile` via chat intent parser

### Phase 2 — Stack + Scheduler
- [x] 2.1 — Prisma: `post_candidates` + migration
- [x] 2.2 — Stack primitives: push, pop_top, expire, depth
- [x] 2.3 — Prisma: `cadence_config` + migration
- [x] 2.4 — Prisma: `scheduled_slots` + migration
- [x] 2.5 — Slot scheduler cron (materialize next-N slots)
- [x] 2.6 — Pop-and-publish integration with Postiz publisher
- [x] 2.7 — Prisma: `published_posts` + migration (joins to candidates)
- [x] 2.8 — Stock keeper agent skeleton
- [x] 2.9 — Stale candidate sweeper cron
- [x] 2.10 — Stack depth enforcement (minimum N, never empty)
- [x] 2.11 — Evergreen fallback pool seed + retrieval
- [ ] 2.12 — Pause/resume: `cadence_config.paused_until` + slot scheduler respect

### Phase 3 — Generation sub-agents
- [ ] 3.1 — Copywriter agent (draft generation, voice-aware)
- [ ] 3.2 — Fan-out agent (intent → per-platform drafts → stacks)
- [ ] 3.3 — Platform rewrite skill (draft → platform-tuned variant)
- [ ] 3.4 — Researcher agent (Tavily integration)
- [ ] 3.5 — Researcher agent (Apify basic)

### Phase 4 — Learning loop
- [ ] 4.1 — Analytics snapshot skill (per platform, reuse Postiz where possible)
- [ ] 4.2 — Rollback skill (delete from platform + mark row)
- [ ] 4.3 — Prisma: `strategy_patterns` + `tenant_strategy_optout` + migration
- [ ] 4.4 — Analyzer agent (performance → tenant memory)
- [ ] 4.5 — Analyzer: anonymized strategy pattern extraction
- [ ] 4.6 — Opt-out setting surface in chat

### Phase 5 — Reports
- [ ] 5.1 — Report skill skeleton (kind, range, channel)
- [ ] 5.2 — Email delivery via existing Resend integration
- [ ] 5.3 — PDF rendering
- [ ] 5.4 — Chart rendering (inline chat + PDF embed)
- [ ] 5.5 — Prisma: `report_config` + migration
- [ ] 5.6 — Scheduled report cron

### Phase 6 — Telegram
- [ ] 6.1 — Telegram bot webhook endpoint
- [ ] 6.2 — Pairing flow: bot command → one-time token
- [ ] 6.3 — Inbound message → chat pipeline (source='telegram')
- [ ] 6.4 — Report delivery via Telegram channel

### Phase 7 — Browser automation API
- [ ] 7.1 — `/browser_automation/*` namespace + auth: extension pairing (one-time code → long-lived token)
- [ ] 7.2 — Engagement agent skeleton
- [ ] 7.3 — First decision endpoint: `POST /browser_automation/decide-on-post`

### Phase 8 — Article ingestion (paid-only)
- [ ] 8.1 — Article source webhook endpoint
- [ ] 8.2 — Article scraper skill
- [ ] 8.3 — Article → fan-out wiring

### Phase 9 — Cost reconciliation & ops
- [ ] 9.1 — Cost reconciler cron (declared vs. actual LLM spend)
- [ ] 9.2 — Internal dashboards stub (read-only activity log view)

---

## Architecture cheat sheet

> **Populated by slice 0.0.** If you learn something new in any slice, update the relevant entry here instead of re-discovering next session.

### Repo shape (Postiz monorepo)
- Root: `/home/kaleb/postiz-app`
- Monorepo tool: **pnpm workspaces** (NOT NX). `pnpm-workspace.yaml` lists `apps/*` and `libraries/*`. Package manager: `pnpm`.
- Apps (top-level in `apps/`):
  - `apps/backend` — NestJS API
  - `apps/frontend` — Next.js UI (App Router)
  - `apps/workers` — BullMQ consumers
  - `apps/cron` — scheduled jobs (`@nestjs/schedule` + `BullMqClient`)
  - `apps/commands` — CLI tasks
  - `apps/extension` — **Postiz's own extension; NOT our browser automation extension.** Do not modify for autopilot work.
  - `apps/sdk` — Postiz public SDK
- Libraries:
  - `libraries/nestjs-libraries` — shared backend code (most Postiz backend logic lives here)
  - `libraries/react-shared-libraries` — shared frontend code (`form`, `helpers`, `translation`, `toaster`, `sentry`)
  - `libraries/helpers` — utilities (auth, fetch, config checker, swagger)
- TypeScript path aliases (from `tsconfig.base.json`):
  - `@gitroom/backend/*` → `apps/backend/src/*`
  - `@gitroom/nestjs-libraries/*` → `libraries/nestjs-libraries/src/*`
  - `@gitroom/frontend/*` → `apps/frontend/src/*`
  - `@gitroom/helpers/*` → `libraries/helpers/src/*`
  - `@gitroom/react/*` → `libraries/react-shared-libraries/src/*`
  - `@gitroom/workers/*` → `apps/workers/src/*`

### Paths to locate in slice 0.0 and record here
- **Prisma schema**: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
- **DB push command**: `pnpm prisma-db-push` (root package.json script). **Postiz uses `db push`, NOT migrations — there is no `migrations/` directory.** All Prisma schema additions go in `schema.prisma`, then run `prisma-db-push` to sync. Client regen: `pnpm prisma-generate`.
- **Backend module registration convention**: Add module to `imports[]` in `apps/backend/src/app.module.ts`. Implement the module under `libraries/nestjs-libraries/src/` (e.g., `ChatModule`, `AgentModule`). For authenticated HTTP controllers, also add to `authenticatedController` array in `apps/backend/src/api/api.module.ts`, which auto-applies `AuthMiddleware`.
- **BullMQ setup**: Module at `libraries/nestjs-libraries/src/bull-mq-transport-new/bull.mq.module.ts`, client is `BullMqClient` (injected via DI). Emit jobs: `this._workerServiceProducer.emit('<queue>', { id, options: { delay }, payload })`. **Existing queue names**: `post`, `submit`, `sendDigestEmail`, `webhooks`, `cron`, `plugs`, `internal-plugs`, `sync_all_stars`. Workers consume via `@EventPattern('<queue>', Transport.REDIS)` in `apps/workers/src/app/posts.controller.ts`.
- **Env validation**: Custom `ConfigurationChecker` class at `libraries/helpers/src/configuration/configuration.checker.ts`. Called at end of `apps/backend/src/main.ts::checkConfiguration()`. Add autopilot checks by calling `checker.checkNonEmpty(key)` or `checker.checkIsValidUrl(key)` inside the `check()` method. No Joi/Zod — it's a plain class with manual checks that log warnings (non-fatal by default).
- **Auth guard + session shape**: `AuthMiddleware` at `apps/backend/src/services/auth/auth.middleware.ts`. JWT from cookie `auth` or header `auth`, verified via `AuthService.verifyJWT()` (`@gitroom/helpers/auth/auth.service`). Sets `req.user: User` (Prisma User type) and `req.org: Organization` (with `.users[0].role`). Global `PoliciesGuard` (`apps/backend/src/services/auth/permissions/permissions.guard.ts`) handles ability-based access; use `@CheckPolicies()` decorator from `permissions.ability.ts`. Public routes bypass auth middleware.
- **Resend email helper**: Provider at `libraries/nestjs-libraries/src/emails/resend.provider.ts`. Use via `EmailService` (`@gitroom/nestjs-libraries/services/email.service`). Call `emailService.sendEmail(to, subject, html, replyTo?)`.
- **Media upload flow**: `UploadModule` from `@gitroom/nestjs-libraries/upload/upload.module`; imported in `ApiModule`. Media stored via `STORAGE_PROVIDER` env var. Frontend uploads hit `apps/frontend/src/app/(app)/api/uploads/[[...path]]/route.ts`.
- **Publisher entry point**: `apps/workers/src/app/posts.controller.ts` → `@EventPattern('post')` → `PostsService.post(id)` (at `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts:293`) → `postSocial()` → `integrationManager.getSocialIntegration(provider).post(internalId, token, posts)`. The integration `.post()` method is the final call to the platform API.
- **Postiz org/tenant model**: `Organization` (PascalCase, no `@@map`) is the tenant. Users linked via `UserOrganization` junction (fields: `userId`, `organizationId`, `role: Role`, `disabled`). In request context: `req.org: Organization` (with `org.users` array for current user's membership). `req.org.id` = tenantId throughout the app.
- **Frontend app router**: `apps/frontend/src/app/(app)/(site)/` for authenticated pages. Route groups: `(app)` wraps everything, `(site)` for main app pages, `(preview)` for public post previews. Shared layout component: `apps/frontend/src/components/new-layout/layout.component`. Page-level components live in `apps/frontend/src/components/`.
- **Shared UI components dir**: `apps/frontend/src/components/` for app-specific; `libraries/react-shared-libraries/src/` for shared (`form/button`, `helpers/variable.context`, `translation/*`). No centralized shadcn/ui or design-system library — Postiz rolls its own components.
- **i18n config**: `i18n.json` at repo root, consumed via `@gitroom/react/translation/get.transation.service.client` (`useT()` hook client-side) and `@gitroom/react/translation/get.transation.service.server` server-side.

### Conventions we're adopting (our code only; don't change Postiz's existing conventions)
- New backend code for autopilot goes under a dedicated module (path decided in slice 0.2).
- Prisma model names: PascalCase (follow existing Postiz style — confirm in slice 0.0).
- Table names: snake_case matching the project plan (via `@@map`).
- All autopilot-added DB tables are prefixed `ap_` in `@@map` to avoid collisions with Postiz tables. _(Adjust in slice 0.0 after reviewing existing table names.)_
- All autopilot env vars prefixed `AP_` (e.g., `AP_OPENAI_API_KEY`, `AP_ENCRYPTION_KEY`, `AP_PAYPAL_CLIENT_ID`).
- Skills: one file per skill, default-exported registry entry.
- Agents: one file per agent, exports `{ name, systemPrompt, skills, run(ctx, input) }`.
- Never hardcode LLM provider in skill handlers — go through `llm.ts` helper.
- Never write directly to config tables from a chat handler — always via the confirm pipeline.

### Key files added in Phase 1 (record here so future sessions skip re-derivation)
- **Intent parser agent**: `libraries/nestjs-libraries/src/autopilot/agents/intent_parser.ts`. Exports `parseIntent(message, llm, tenantCtx?)` + `intentParserAgent: AgentDefinition`. Uses `generateObject` from `ai-v5` with a Zod schema.
- **Proposal pipeline**: `libraries/nestjs-libraries/src/autopilot/chat/proposals.ts`. Exports `createProposal`, `listPending`, `confirm`, `cancel`, `registerApplier`. Re-exported from `autopilot/chat/index.ts`.
- **Built-in appliers**: `business_profile` (field-whitelisted upsert) and `growth_rule` (create or update by id) registered at module load. Add new appliers via `registerApplier(entity, fn)` from other modules.

### Key files added in Phase 1 — slice 1.11
- **chat-layout.tsx** (updated): `AutopilotChatLayout` now wires to `POST /autopilot/chat` via `useFetch`. Reads SSE stream with `response.body.getReader()` + `TextDecoder`. Events: `text` (streamed to `AssistantMsg`), `proposal` (renders `ProposalBubble` with `CardSelect`), `done` (clears streaming flag), `error` (renders `ErrorBubble`). Starter chips call `handleSend(prompt)` directly. Spinner shows while `sending=true`; textarea disabled during send.
- **confirm/cancel endpoints**: `PATCH /autopilot/chat/proposals/:id/confirm` and `PATCH /autopilot/chat/proposals/:id/cancel` added to `AutopilotChatController`. Both guarded by `organizationId` check. Service methods: `confirmProposal(proposalId, tenantId): Promise<ConfirmResult>`, `cancelProposal(proposalId, tenantId): Promise<void>`.
- **SSE parsing pattern**: `buffer += decoder.decode(value, { stream: true })`; split on `\n`; keep trailing partial line in buffer; parse lines starting with `data: `.

### Key files added in Phase 1 — slice 1.10
- **CardSelect component**: `apps/frontend/src/components/autopilot/card-select.tsx`. Exports `CardSelect` (FC) and `CardSelectOption`, `CardSelectProps` types. Props: `options: CardSelectOption[]` (`id`, `label`, `description?`), `onSelect(id: string): void`, `selectedId?: string` (controlled), `title?: string`, `disabled?: boolean`. Supports uncontrolled (internal state) and controlled modes. Keyboard accessible (Enter / Space). Renders a vertical list of bordered card buttons.

### Key files added in Phase 1 — slice 1.9
- **Autopilot chat UI**: `apps/frontend/src/components/autopilot/chat-layout.tsx`. Exports `AutopilotChatLayout` (FC, no props). Renders welcome state with starter chips when messages empty; `ChatBubble` for each message (user right-aligned / assistant left-aligned). Input: textarea + send button, Enter to send, Shift+Enter for newline. Local state only — no backend wiring yet (slice 1.11 wires it).
- **Autopilot route**: `apps/frontend/src/app/(app)/(site)/autopilot/page.tsx` — renders `AutopilotChatLayout` inside the standard `(site)` layout.
- **Nav item**: `Autopilot` added as first entry in `firstMenu` in `top.menu.tsx`, path `/autopilot`, speech-bubble SVG icon.

### Key files added in Phase 1 — slices 1.7–1.8
- **Memorist agent**: `autopilot/agents/memorist.ts`. Exports `runMemorist(ctx, input)` and `memoristAgent`. Input: `{ turns: MemoryTurn[] }`. Output: `{ decisions: MemoryDecision[], stored: number }`. Calls `writeVector(db, tenantId, entry)` for `store`/`update` decisions.
- **AutopilotChatService**: `autopilot/chat/chat.service.ts`. NestJS `@Injectable`. Constructor: `(private _prisma: PrismaService)`. Main method: `handleChat(org, user, input: ChatIngressInput, emit: (event: ChatStreamEvent) => void): Promise<void>`. Stream event types: `ChatTextEvent | ChatProposalEvent | ChatDoneEvent | ChatErrorEvent`.
- **AutopilotChatController**: `apps/backend/src/api/routes/autopilot-chat.controller.ts`. Authenticated route `POST /autopilot/chat`. Body: `{ content: string, source?: 'web'|'telegram'|'api' }`. Returns `text/event-stream` SSE. Registered in `authenticatedController` array in `api.module.ts`.

### Key files added in Phase 1 — slices 1.5–1.6
- **Memory service**: `autopilot/memory/index.ts`. Exports `getStructuredProfile`, `writeVector`, `queryVector`, `listRecent`, `ensureVectorIndex`. All vector operations use `$queryRaw` / `$executeRaw` because the `embedding` column is `Unsupported("vector(1536)")` in Prisma.
- **Embedding helper**: `embedText(text)` and `selectEmbeddingModel()` added to `autopilot/llm.ts`. Uses `@ai-sdk/openai` `text-embedding-3-small` (1536 dims). Requires `AP_OPENAI_API_KEY`.

### Key files added in Phase 1 — slice 1.12
- **Onboarding agent**: `autopilot/agents/onboarding.ts`. Exports `analyzeOnboarding(model: LanguageModel, history: OnboardingTurn[], latestMessage: string): Promise<OnboardingResult>`, `buildOnboardingReplyPrompt(topic: string, history: OnboardingTurn[]): string`, and `onboardingAgent: AgentDefinition`. `OnboardingResult` is `{ action: 'ask'; topic: string } | { action: 'propose'; draft: DraftProposal }`. Uses `generateObject` from `ai-v5` with a Zod schema to decide whether to ask another question or propose a business_profile.
- **Chat service onboarding routing**: `chat.service.ts` now detects first-run (no `ApBusinessProfile` row for the tenant). When `isFirstRun`, loads conversation history via `_loadOnboardingHistory()` and routes through `analyzeOnboarding()` instead of the intent parser. The onboarding flow uses `streamText` with `messages` (full conversation context) for follow-up questions, and the existing `createProposal` → confirm → apply pipeline for the final profile proposal.
- **Starter prompts updated**: First chip is now "Help me set up my business profile" (triggers onboarding for new tenants).

### Key files added in Phase 2 — slice 2.11
- **EvergreenPoolService**: `autopilot/stack/evergreen-pool.service.ts`. `@Injectable()`. Constructor: `(private _prisma: PrismaService)`. Methods:
  - `seedEvergreen(tenantId, platform, content, options?: SeedEvergreenOptions): Promise<ApPostCandidate>` — creates evergreen candidate (`source='evergreen'`, `expiresAt=null`, `priority=-1`).
  - `pickFallback(tenantId, platform): Promise<ApPostCandidate | null>` — atomically reserves oldest PENDING evergreen, immediately clones it back to PENDING (pool size stays constant), returns the RESERVED row. Returns null if pool empty.
  - `poolSize(tenantId, platform): Promise<number>` — count of PENDING evergreen candidates.
- **PopAndPublishService updated**: When `popTop` returns null, calls `_evergreenPool.pickFallback()`; if still null marks slot SKIPPED with `skipReason='empty_stack_no_evergreen'`.
- **Evergreen candidate conventions**: `source='evergreen'`, `expiresAt=null` (immune to stale sweeper), `priority=-1` (lower than regular candidates — `popTop` drains them last).

### Key files added in Phase 2 — slices 2.8–2.10
- **Stock keeper agent**: `autopilot/agents/stock-keeper.ts`. Exports:
  - `assessStock(input: StockKeeperInput): StockKeeperOutput` — pure sync function; call directly in background services (no AgentContext needed).
  - `runStockKeeper(ctx: AgentContext, input): Promise<StockKeeperOutput>` — async AgentDefinition wrapper.
  - `stockKeeperAgent: AgentDefinition<StockKeeperInput, StockKeeperOutput>` — id: `'stock_keeper'`.
  - `StockKeeperOutput.action`: `'ok' | 'refill'`; `deficit`: posts needed to reach `minDepth`.
- **StaleSweeperService**: `autopilot/stack/stale-sweeper.service.ts`. `@Injectable()`. Constructor: `(private _prisma: PrismaService)`. Method: `sweepAll(): Promise<number>` — calls `expire(db)` globally (no tenantId), returns count expired.
- **SweepStaleCandidates cron**: `apps/cron/src/tasks/sweep-stale-candidates.ts`. `@Cron('30 * * * *')` — every hour at :30. Injects `StaleSweeperService`.
- **DepthEnforcerService**: `autopilot/stack/depth-enforcer.service.ts`. `@Injectable()`. Constructor: `(private _prisma: PrismaService)`. Method: `enforceAll(): Promise<EnforceAllResult>` — read-only; fetches active cadence configs, calls `depth()` + `assessStock()` per pair, warns on deficit. Constants: `MIN_STACK_ABSOLUTE=3`, `MIN_STACK_DAYS_BUFFER=2`. Result: `{ configs, ok, deficits, signals: StockKeeperOutput[] }`.
- **EnforceStackDepth cron**: `apps/cron/src/tasks/enforce-stack-depth.ts`. `@Cron('*/15 * * * *')` — every 15 minutes. Injects `DepthEnforcerService`.

### Key files added in Phase 2 — slices 2.6–2.7
- **PopAndPublishService**: `autopilot/stack/pop-and-publish.service.ts`. `@Injectable()`. Constructor: `(private _prisma: PrismaService, private _bullMq: BullMqClient)`. Main method: `triggerDueSlots(): Promise<TriggerResult>` — sweeps PENDING `ApScheduledSlot` rows with `scheduledAt ≤ now()`, atomically claims each via `updateMany({ where: { id, status:PENDING }, data:{ status:TRIGGERED } })` (concurrent-safe), pops a candidate with `popTop()`, creates a Postiz `Post` row (`state:'QUEUE'`, `publishDate:slot.scheduledAt`), emits `bullMq.emit('post', { id, options:{delay:0}, payload:{id} })`, writes an `ApPublishedPost` record. Returns `{ triggered, skipped, alreadyClaimed }`.
- **TriggerDueSlots cron**: `apps/cron/src/tasks/trigger-due-slots.ts`. `@Cron('* * * * *')` — fires every minute. Injects `PopAndPublishService`, calls `triggerDueSlots()`. Logs only when there is activity.
- **CronModule updated**: `apps/cron/src/cron.module.ts` — `PopAndPublishService` and `TriggerDueSlots` added to `providers`. `BullMqClient` is available via already-imported `BullMqModule`.
- **ApPublishedPost model**: `schema.prisma` (`@@map("ap_published_post")`). Key fields: `organizationId`, `platform`, `postCandidateId` (FK → ApPostCandidate), `scheduledSlotId?` `@unique` (FK → ApScheduledSlot), `postizPostId` (Postiz Post.id), `publishedAt`, `releaseUrl?`, `metadata`. Indexes: `(organizationId, publishedAt)`, `(postCandidateId)`.

### Key files added in Phase 2 — slice 2.5
- **SlotSchedulerService**: `autopilot/stack/slot-scheduler.service.ts`. `@Injectable()`. Constructor: `(private _prisma: PrismaService)`. Main method: `materializeSlots(lookaheadDays?: number): Promise<MaterializeResult>` — inserts missing PENDING `ApScheduledSlot` rows for all active, non-paused cadence configs. Idempotent (exact-ms deduplication). Pure exported helpers: `wallClockToUtc(year, month, day, hour, minute, timezone): Date` (Intl probe technique, no external libs) and `buildSlotHHMMs(preferredTimes: string[], postsPerDay: number): string[]` (uses preferred times first, spreads remaining evenly).
- **MaterializeSlots cron task**: `apps/cron/src/tasks/materialize-slots.ts`. `@Cron('0 * * * *')` — runs every hour at :00. Injects `SlotSchedulerService`, calls `materializeSlots(7)`.
- **CronModule updated**: `apps/cron/src/cron.module.ts` — `SlotSchedulerService` and `MaterializeSlots` added to `providers`. `PrismaService` is available via the already-imported `DatabaseModule`.

### Key files added in Phase 2 — slices 2.3–2.4
- **ApCadenceConfig model**: `schema.prisma` (`@@map("ap_cadence_config")`). Enum `ApCadenceConfigSource`: `AI | USER | DEFAULT`. Key fields: `organizationId`, `platform`, `postsPerDay (Int default 1)`, `preferredTimes (Json default "[]")`, `timezone (String default "UTC")`, `pausedUntil (DateTime?)`, `active (Boolean default true)`, `source`, `version (Int default 1)`. Unique on `(organizationId, platform)`.
- **ApScheduledSlot model**: `schema.prisma` (`@@map("ap_scheduled_slot")`). Enum `ApScheduledSlotStatus`: `PENDING | TRIGGERED | SKIPPED | CANCELLED`. Key fields: `organizationId`, `platform`, `scheduledAt (DateTime)`, `status (default PENDING)`, `postCandidateId (String?)` — FK to `ApPostCandidate` (null at creation; filled by pop-and-publish in slice 2.6), `metadata (Json)`. Indexes: `(organizationId, platform, scheduledAt, status)` for per-tenant scheduler query; `(scheduledAt, status)` for global cron sweep.
- **ApPostCandidate updated**: added `apScheduledSlot ApScheduledSlot[]` back-relation.

### Key files added in Phase 2 — slices 2.1–2.2
- **ApPostCandidate model**: `schema.prisma` (`@@map("ap_post_candidate")`). Enum `ApPostCandidateStatus`: `PENDING | RESERVED | PUBLISHED | EXPIRED | FAILED`. Key fields: `organizationId`, `platform`, `content`, `contentVariants (Json)`, `mediaUrls (Json)`, `status`, `priority (Int default 0)`, `source (String)`, `expiresAt (DateTime?)`, `metadata (Json)`.
- **Stack service**: `autopilot/stack/index.ts`. Exported functions:
  - `push(db: PrismaClient, tenantId: string, platform: string, content: string, options?: PushOptions): Promise<ApPostCandidate>`
  - `popTop(db: PrismaClient, tenantId: string, platform: string): Promise<ApPostCandidate | null>` — uses `SELECT … FOR UPDATE SKIP LOCKED` via `$queryRaw` + `$transaction`; returns a RESERVED row.
  - `expire(db: PrismaClient, tenantId?: string): Promise<number>` — marks stale PENDING rows EXPIRED; omit tenantId for global sweep.
  - `depth(db: PrismaClient, tenantId: string, platform?: string): Promise<number>` — count of PENDING non-expired candidates.

### Non-obvious gotchas (append as discovered)
- **No Prisma migrations** — Postiz uses `prisma db push` exclusively. When slice definitions say "migration generated/applied," interpret as: add model to `schema.prisma`, run `pnpm prisma-db-push`, regenerate client with `pnpm prisma-generate`.
- **No `@@map` anywhere in schema** — Postiz table names in Postgres match the PascalCase model name exactly (Prisma default). Our `ap_` prefix must be set via `@@map("ap_credit_ledger")` etc.
- **`credits` table already exists** in Postiz (model `Credits`, tracks AI image credits). Our ledger table MUST use `@@map("ap_credit_ledger")` to avoid collision; do not reuse Postiz's Credits table.
- **`subscriptions` table already exists** in Postiz (model `Subscription`). Our autopilot subscription table must be `@@map("ap_subscriptions")`.
- **Env validation is non-fatal warnings** by default — `ConfigurationChecker` only logs, does not throw. To make `AP_ENCRYPTION_KEY` fail-fast, add a throw inside `check()` when autopilot module is enabled.
- **Module pattern**: Most shared backend logic lives in `libraries/nestjs-libraries/src/`, not `apps/backend/src/`. Put autopilot services/repositories in `libraries/nestjs-libraries/src/autopilot/` and expose via an `AutopilotModule` imported in `app.module.ts`.
- **Root path alias for our new code**: `@gitroom/autopilot/*` → `libraries/nestjs-libraries/src/autopilot/*` (added to `tsconfig.base.json` in slice 0.2). Use `@gitroom/autopilot/skills`, `@gitroom/autopilot/agents`, etc. to import from autopilot subdirectories.
- **Running autopilot unit tests**: `node_modules/.bin/jest --config=libraries/nestjs-libraries/jest.config.js --testPathPattern=<pattern>`. Config created in slice 0.11 (ts-jest 29, no NX dependency). `@nx/jest` is NOT installed — do not reference it.
- **Vercel AI SDK versions**: Repo has `ai` v4.3.19 AND `ai-v5` (ai@5.0.60, pnpm alias). Provider packages (`@ai-sdk/anthropic-v5`, `@ai-sdk/google-v5`, `@ai-sdk/openai`, `@ai-sdk/openai-v5`) all return `LanguageModelV2` and require the v5 runtime. **Always import from `ai-v5`, not `ai`, in autopilot code.** Use `maxOutputTokens` (not `maxTokens`) in ai-v5. Providers importable as: `@ai-sdk/anthropic-v5`, `@ai-sdk/google-v5`, `@ai-sdk/openai`.
- **PayPal webhook endpoint**: `POST /autopilot/paypal/webhook` — registered as a public (non-authenticated) controller in `ApiModule`. Signature verification calls `POST /v1/notifications/verify-webhook-signature` via OAuth2 client-credentials. `PaypalWebhookService` uses `https://api-m.sandbox.paypal.com` when `NODE_ENV !== 'production'`; live uses `https://api-m.paypal.com`. `AP_PAYPAL_WEBHOOK_ID` required for verification.
- **Circular relation (ApDiscountApplication ↔ ApInvoice)**: Two named Prisma relations between these models — `"DiscountAppToInvoice"` (FK on `ApDiscountApplication.invoiceId`) and `"InvoiceToDiscountApp"` (FK on `ApInvoice.discountApplicationId`, `@unique`). Both FKs are optional. This is valid in Prisma but requires naming both sides to avoid ambiguity.
- **pgvector extension requires superuser**: `CREATE EXTENSION vector;` must be run as the `postgres` superuser before `pnpm prisma-db-push`. The `postiz-local` app user lacks `SUPERUSER`. On this machine the postgres password is known from bash history. In CI/production, add it to the DB init script.
- **pgvector and Prisma `Unsupported` type**: Prisma cannot serialize/deserialize the `vector` type. All reads/writes on `ApMemoryVector.embedding` must use `$queryRaw` / `$executeRaw`. Do not try to use Prisma ORM findMany/create on the embedding column directly.
- **Embedding model**: Only `AP_OPENAI_API_KEY` enables embeddings (`text-embedding-3-small`, 1536 dims). Anthropic and Google have no embedding model in the current SDK wiring. If the key is absent, `embedText()` throws immediately.
- **IVFFLAT index**: Created via raw SQL (superuser) outside of Prisma — Prisma cannot manage indexes on `Unsupported` columns. `ensureVectorIndex(db)` in the memory service calls `CREATE INDEX IF NOT EXISTS` but requires the calling DB user to have index creation rights (app user has this). The `WITH (lists = 100)` value is suitable for up to ~1M rows; reconfigure when scaling.

---

## Module layout (target)

This is the autopilot code structure we're building toward. Exact paths depend on Postiz NX conventions discovered in slice 0.0; adjust then, but keep the logical grouping.

```
autopilot/
  tiers.ts                 # tier definitions (dev-editable)
  skill-costs.ts           # integer credit costs per skill id
  llm.ts                   # Vercel AI SDK wiring, provider selection
  pipeline.ts              # pre-flight (plan gate → credit gate → dispatch)

  skills/                  # one file per skill; exports registry entry
    index.ts               # registry aggregator
    push_to_stack.ts
    ...

  agents/                  # one file per sub-agent
    intent_parser.ts
    fan_out.ts
    copywriter.ts
    stock_keeper.ts
    researcher.ts
    memorist.ts
    analyzer.ts
    engagement.ts
    reporter.ts

  stack/                   # stack primitives (push/pop/expire/depth)
  memory/                  # structured + vector memory helpers
  discount/                # origin-agnostic discount module
  credits/                 # ledger, debit/credit helpers
  activity/                # activity log helpers
  capability_gaps/         # gap logger
  encryption/              # per-tenant secret encryption utility
  chat/                    # chat ingress, sources, proposal/confirm pipeline
  reports/                 # report skill + channel delivery
  browser_automation/      # API namespace, pairing, engagement endpoint

  webhooks/
    paypal.ts
    telegram.ts
    article_source.ts
```

---

## Conventions

### Commit style
- One commit per slice when possible.
- Message: `slice(<id>): <short imperative summary>`
- Example: `slice(0.7): add credit_ledger table and migration`
- Keep each commit isolated; don't fold unrelated fixes in.

### Test expectations
- If the slice touches DB: verify the migration applies cleanly in a local run. No unit test required unless logic is non-trivial.
- If the slice adds a helper with logic (e.g., encryption, credit debit): one focused unit test.
- If the slice adds an agent/skill: a smoke test that constructs it and verifies the registry entry shape. Full behavior tests come later.
- Don't add integration tests unless the slice says so.

### "Done" checks that apply to every slice
- Typecheck passes for the affected package(s).
- No new lint errors (run lint on affected files only).
- Migrations (if any) apply cleanly against a fresh DB.
- This file updated per §Self-tracking protocol.

---

## Slice definitions

Each slice is short enough for a single session. If a slice feels heavy, it's actually two slices — stop and split it before coding. Later phases list slices with brief goals only; expand those slices into full specs in the session that tackles them.

### Phase 0 — Foundation

#### Slice 0.0 — Map repo + populate Architecture cheat sheet
- **Goal:** fill every `_TBD_` in §Architecture cheat sheet so no future slice has to re-explore.
- **Depends on:** nothing.
- **Files touched:** `coding_guide.md` (this file) only.
- **Steps:**
  - Locate the Prisma schema; record absolute path.
  - Locate DB migration directory; record.
  - Identify how backend modules register (look at existing module imports in `apps/backend`); record example.
  - Find BullMQ queue setup; list existing queue names; record file.
  - Find env validation mechanism (search for `Joi`, `zod`, `validateSync`, `class-validator`); record file.
  - Find auth guard + session shape (search for `AuthGuard`, `JwtStrategy`, or Postiz custom); record.
  - Find Resend helper; record import path.
  - Find publisher entry — where a scheduled post is taken off the queue and sent to the integration; record file.
  - Find Postiz org/tenant table(s) in Prisma; record model name and relation to user.
  - Record frontend app router location and shared component dir.
  - Decide final prefix for autopilot tables/envs after reviewing naming (default `ap_` / `AP_` unless collision).
- **Definition of done:** no `_TBD_` left in §Architecture cheat sheet; prefix decision confirmed.
- **Out of scope:** no code changes, no new files.

#### Slice 0.1 — Env vars and validation
- **Goal:** register autopilot env vars and fail-fast validation at boot.
- **Depends on:** 0.0.
- **Files touched:**
  - Extend existing env validator discovered in 0.0.
  - Add `.env.example` entries for autopilot vars.
- **Env vars to add (all optional where possible for dev):**
  - `AP_ENCRYPTION_KEY` (required, 32-byte base64)
  - `AP_OPENAI_API_KEY` (optional)
  - `AP_ANTHROPIC_API_KEY` (optional)
  - `AP_GOOGLE_API_KEY` (optional)
  - `AP_TAVILY_API_KEY` (optional)
  - `AP_APIFY_API_KEY` (optional)
  - `AP_PAYPAL_CLIENT_ID` (optional in dev)
  - `AP_PAYPAL_CLIENT_SECRET` (optional in dev)
  - `AP_PAYPAL_WEBHOOK_ID` (optional in dev)
  - `AP_TELEGRAM_BOT_TOKEN` (optional)
  - `AP_CREDIT_UNIT_USD` (default `0.01`)
- **Definition of done:** boot succeeds without autopilot features configured; with `AP_ENCRYPTION_KEY` missing, boot fails with clear message only if autopilot module is enabled.
- **Out of scope:** wiring these into any feature. Only validation and `.env.example`.

#### Slice 0.2 — Empty module directory structure
- **Goal:** create the directory skeleton from §Module layout with `index.ts` placeholders so subsequent slices just drop code in.
- **Depends on:** 0.0.
- **Files touched:** new directories + empty `index.ts` exports only.
- **Definition of done:** every folder listed in §Module layout exists with an `index.ts` that exports nothing (or re-exports from files once they arrive). Typecheck passes.
- **Out of scope:** any real implementation.

#### Slice 0.3 — Skill registry core types
- **Goal:** define the TypeScript types for a skill registry entry and a central `SkillRegistry` map.
- **Depends on:** 0.2.
- **Files touched:** `autopilot/skills/types.ts`, `autopilot/skills/index.ts`.
- **Types to export:** `SkillId`, `SkillEntry<Input, Output>`, `SkillHandler`, `SkillContext` (tenant, user, db, llm, logger).
- **Definition of done:** `SkillRegistry: Record<SkillId, SkillEntry>` compiles; empty registry accepted; type errors surface if an entry is malformed.
- **Out of scope:** any actual skills.

#### Slice 0.4 — `tiers.ts` scaffold
- **Goal:** define tier type, export a single `Free` tier matching project plan §4.
- **Depends on:** 0.2.
- **Files touched:** `autopilot/tiers.ts`.
- **Definition of done:** `TIERS: Record<TierId, TierDefinition>` compiles; `TIERS.free` present with the MVP values from project plan §4.
- **Out of scope:** Starter/Pro tiers; feature unlock logic.

#### Slice 0.5 — `skill-costs.ts` scaffold
- **Goal:** empty integer-keyed credit cost registry with helper `getSkillCost(skillId)`.
- **Depends on:** 0.3.
- **Files touched:** `autopilot/skill-costs.ts`.
- **Definition of done:** helper returns `0` for unknown skill and logs a warning; typecheck passes.
- **Out of scope:** populating costs.

#### Slice 0.6 — Agent base types
- **Goal:** shared types for sub-agents.
- **Depends on:** 0.3.
- **Files touched:** `autopilot/agents/types.ts`.
- **Types:** `AgentDefinition { id, systemPrompt, allowedSkills: SkillId[], run(ctx, input) }`, `AgentContext`.
- **Definition of done:** typecheck passes; an example stub agent compiles against the type.
- **Out of scope:** any real agent.

#### Slice 0.7 — Prisma: `credit_ledger`
- **Goal:** table + migration.
- **Depends on:** 0.0 (knowing Prisma location).
- **Columns:** `id, tenant_id, delta (int), balance_after (int), reason (enum grant|debit|refund|purchase|expire), reference (string, nullable), created_at`.
- **Indexes:** `(tenant_id, created_at desc)`.
- **Definition of done:** migration generated, names applied cleanly, Prisma client types regenerated.

#### Slice 0.8 — Prisma: `activity_log`
- **Columns:** `id, tenant_id, user_id (nullable), skill_id (string), llm_model (string nullable), input_tokens (int nullable), output_tokens (int nullable), dollar_cost (decimal nullable), credits_charged (int), status (enum success|failure|partial), metadata (json), created_at`.
- **Indexes:** `(tenant_id, created_at desc)`, `(skill_id, created_at desc)`.

#### Slice 0.9 — Prisma: `capability_gaps`
- **Columns:** `id, tenant_id, user_message (text), attempted_skills (string[]), reason (text), resolved (bool default false), created_at`.

#### Slice 0.10 — Prisma: `chat_messages`
- **Columns:** `id, tenant_id, role (enum user|assistant|system|tool), content (text), source (enum web|telegram|api), metadata (json), created_at`.
- **Indexes:** `(tenant_id, created_at)`.

#### Slice 0.11 — Encryption utility
- **Goal:** per-tenant symmetric encryption using `AP_ENCRYPTION_KEY`.
- **Files touched:** `autopilot/encryption/index.ts`.
- **API:** `encrypt(plaintext: string): string`, `decrypt(ciphertext: string): string`. Uses authenticated encryption (AES-256-GCM, random IV, stored together, base64).
- **Definition of done:** one unit test covering round-trip and a tampered-ciphertext rejection.

#### Slice 0.12 — Prisma: `platform_keys` + CRUD service
- **Columns:** `id, tenant_id, platform (string), secret_encrypted (text), meta (json), created_at, updated_at`.
- **Service:** `set(tenantId, platform, plaintext)`, `get(tenantId, platform)`, `delete(tenantId, platform)`. Uses 0.11 for at-rest encryption.
- **Definition of done:** migration applies; service unit-tested for round-trip.

#### Slice 0.13 — Pre-flight pipeline skeleton
- **Goal:** a function that every skill call routes through.
- **Files touched:** `autopilot/pipeline.ts`.
- **Flow:** `(skillId, ctx, input) → check plan gate → check credit balance → run skill handler → log activity → debit credits → return result`. If any gate fails, surface a typed failure, log capability gap when appropriate.
- **Definition of done:** unit test with mocked tenant + skill that exercises pass, plan-gate-fail, and insufficient-credits paths.

#### Slice 0.14 — Activity logger + credit debit helpers
- **Files touched:** `autopilot/activity/index.ts`, `autopilot/credits/index.ts`.
- **API:** `logActivity(entry)`, `debitCredits(tenantId, amount, reason, reference)`, `getBalance(tenantId)`.
- **Definition of done:** 0.13 pipeline uses these helpers; unit tests cover balance arithmetic edge cases (insufficient, zero).

#### Slice 0.15 — Capability gap logger
- **Files touched:** `autopilot/capability_gaps/index.ts`.
- **API:** `logGap({ tenantId, userMessage, attemptedSkills, reason })`.
- **Definition of done:** pipeline uses this when a skill call fails for "we can't do this yet" reasons.

#### Slice 0.16 — Vercel AI SDK wiring
- **Files touched:** `autopilot/llm.ts`.
- **Responsibilities:** read env, return a provider-selected model handle given a `preferred` array (e.g., `['claude-sonnet-4-6', 'gpt-4o']`). Support tool-calling. Thin wrapper only.
- **Definition of done:** a smoke test that calls the model with a trivial prompt when an API key is present; skips cleanly when absent.

#### Slice 0.17 — Prisma: `discounts` + `discount_applications`
- **`discounts` columns:** `id, code (string nullable, unique when present), amount_type (enum percent|flat), amount (int), applicable_to (json), valid_from, valid_to, max_uses (int nullable), uses_count (int default 0), active (bool), origin_note (text), created_at`.
- **`discount_applications` columns:** `id, discount_id, tenant_id, invoice_id (nullable), applied_at, amount_applied (int)`.

#### Slice 0.18 — Discount module
- **Files touched:** `autopilot/discount/index.ts`.
- **API:** `resolveDiscount(code | context) → DiscountResult | null`, `applyDiscount(tenantId, discountId, invoiceId, amount)`, `listActive(tenantId?)`. Origin-agnostic.
- **Definition of done:** unit tests for code validation, expiry, and max-uses.

#### Slice 0.19 — PayPal webhook scaffolding
- **Files touched:** `autopilot/webhooks/paypal.ts`, backend module registration.
- **Responsibilities:** verify signature using `AP_PAYPAL_WEBHOOK_ID`, log event to activity log with `status: success`, respond 200. No business logic yet — event switch returns no-op per type.
- **Definition of done:** endpoint reachable, signature check works with a replayed real PayPal sample, invalid signatures rejected.

#### Slice 0.20 — Prisma: `subscriptions` + `invoices`
- **`subscriptions` columns:** `id, tenant_id, tier_id (string), billing_cycle (enum monthly|yearly), paypal_subscription_id (string nullable), status (enum active|past_due|cancelled|paused), current_period_end, created_at, updated_at`.
- **`invoices` columns:** `id, tenant_id, subscription_id (nullable), amount_cents (int), discount_application_id (nullable), paypal_invoice_id (nullable), status (enum pending|paid|failed|refunded), issued_at, paid_at (nullable)`.

### Phase 1 — Chat Core

#### Slice 1.1 — Prisma: `business_profile`, `growth_rules`
- **`business_profile` columns:** `id, tenant_id unique, niche, goals (json), brand_voice_short, brand_voice_extended, anti_patterns (json), regulatory_flags (json), updated_at, updated_by (enum ai|user)`.
- **`growth_rules` columns:** `id, tenant_id, rule_key, rule_value (json), active (bool), source (enum ai|user|default), updated_at`.

#### Slice 1.2 — Prisma: `config_change_proposals`
- **Columns:** `id, tenant_id, origin_message_id, target_entity (string), target_id (nullable), changes (json), rationale (text), expires_at, status (enum pending|confirmed|cancelled|expired|applied), created_at, decided_at (nullable)`.

#### Slice 1.3 — Intent parser agent skeleton
- Classify a chat message into one of: `direct_action`, `config_change_request`, `question`, `small_talk`, `unclear`.
- For `config_change_request`, produce a draft proposal row but do not persist yet.
- Uses `llm.ts` + a narrow tool set: none (pure classification/draft output).
- **Definition of done:** unit tests using fixture messages hit each classification bucket.

#### Slice 1.4 — Proposal → confirm → apply pipeline
- **API:** `createProposal`, `listPending`, `confirm(proposalId)`, `cancel(proposalId)`.
- On `confirm`, dispatch to a `target_entity`-keyed applier map (e.g., `cadence_config`, `business_profile`). Ensure optimistic versioning: user edits always win.
- **Definition of done:** a proposal on `business_profile` can be applied and reflected in the row; expired proposals cannot be confirmed.

#### Slice 1.5 — pgvector + `memory_vectors`
- Enable `pgvector` extension via migration.
- **`memory_vectors` columns:** `id, tenant_id, kind (enum anecdote|milestone|brand_rule|learning|competitor|personal_story), content, embedding (vector(1536 or model-specific)), source_ref (json), freshness_ttl_days (int nullable), created_at`.
- **Indexes:** IVFFLAT on embedding scoped by tenant.

#### Slice 1.6 — Memory service
- **API:** `getStructuredProfile(tenantId)`, `queryVector(tenantId, embedding, topK, kinds?)`, `writeVector(tenantId, entry)`, `listRecent(tenantId, kind, limit)`.
- Embeddings via `llm.ts`.
- **Definition of done:** round-trip write then semantic recall smoke test using a small seeded set.

#### Slice 1.7 — Memorist agent skeleton
- Inputs: a batch of chat turns or event payloads. Decides per entry: `store | skip | update`.
- Writes via 1.6.
- **Definition of done:** unit test with fixture turns produces expected decisions.

#### Slice 1.8 — Chat ingress endpoint
- **Route:** `POST /autopilot/chat` with `{ source: 'web', content }`.
- Persists to `chat_messages`, routes to intent parser, streams response.
- **Definition of done:** curl/httpie test end-to-end with a stub LLM.

#### Slice 1.9 — Frontend: chatbot-primary layout scaffold
- A new top-level route that presents a chat pane as the primary UI. Existing Postiz screens still reachable via a minimized nav.
- No backend wiring in this slice.

#### Slice 1.10 — Frontend: card-select component
- Reusable component: `<CardSelect options={[{id,label,description}]} onSelect={...} />`. Used by the confirm pipeline.

#### Slice 1.11 — Wire chat UI to ingress
- Connect 1.9 to 1.8 with streaming. Render assistant text; render card-select when server sends structured confirm payload.

#### Slice 1.12 — Onboarding seed
- First-run chat flow: AI asks essential business profile questions (niche, goals, brand voice, primary platforms) via intent parser → proposals → confirm → apply. No bulk form; conversational.
- **Definition of done:** a new tenant through this flow has a populated `business_profile` row without touching any non-chat UI.

### Phase 2 — Stack + Scheduler

#### Slice 2.1 — Prisma: `post_candidates` + migration
- **Goal:** add the `ap_post_candidate` table that backs the per-tenant, per-platform post queue.
- **Depends on:** 1.1 (Organization back-relations pattern established).
- **Files touched:** `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (new model `ApPostCandidate` + enum `ApPostCandidateStatus` + `Organization` back-relation); `pnpm prisma-db-push`; `pnpm prisma-generate`.
- **Columns:**
  - `id` — UUID PK
  - `organizationId` — FK → Organization
  - `platform` — String (e.g. `'twitter'`, `'linkedin'`)
  - `content` — String (body text)
  - `contentVariants` — Json `{}` (per-platform tuned variants, populated by fan-out agent)
  - `mediaUrls` — Json `[]` (array of media URL strings)
  - `status` — `ApPostCandidateStatus` enum: `PENDING | RESERVED | PUBLISHED | EXPIRED | FAILED`; default `PENDING`
  - `priority` — Int default `0`; higher pops first
  - `source` — String default `'unknown'`; identifies what created it (`'copywriter_agent'`, `'user'`, `'evergreen'`, …)
  - `expiresAt` — `DateTime?`; if set and past, the candidate is treated as stale
  - `metadata` — Json `{}`
  - `createdAt` — `DateTime @default(now())`
  - `updatedAt` — `DateTime @updatedAt`
- **Indexes:**
  - `(organizationId, platform, status, priority DESC, createdAt ASC)` — powers `popTop`
  - `(organizationId, status, expiresAt)` — powers `expire` sweep
- **Definition of done:** migration applies cleanly; Prisma client includes `apPostCandidate` accessor; `ApPostCandidateStatus` enum exported from `@prisma/client`.
- **Out of scope:** any service code, publishing wiring, or scheduler logic.

#### Slice 2.2 — Stack primitives: push, pop_top, expire, depth
- **Goal:** implement the four core stack operations used by later slices (scheduler, publisher, stock keeper).
- **Depends on:** 2.1 (ApPostCandidate table + types).
- **Files touched:** `libraries/nestjs-libraries/src/autopilot/stack/index.ts` (real implementation replacing placeholder).
- **Exported API:**
  - `push(db, tenantId, platform, content, options?)` → `Promise<ApPostCandidate>` — creates a `PENDING` candidate; `options` carries `priority`, `source`, `expiresAt`, `mediaUrls`, `contentVariants`, `metadata`.
  - `popTop(db, tenantId, platform)` → `Promise<ApPostCandidate | null>` — atomically claims the highest-priority non-expired `PENDING` candidate (order: `priority DESC`, `createdAt ASC`) and transitions it to `RESERVED`. Uses `SELECT … FOR UPDATE SKIP LOCKED` inside a transaction so concurrent callers never receive the same row.
  - `expire(db, tenantId?)` → `Promise<number>` — bulk-sets `EXPIRED` on all `PENDING` candidates where `expiresAt < now()`. `tenantId` is optional; omitting it runs across all tenants (for the sweeper cron).
  - `depth(db, tenantId, platform?)` → `Promise<number>` — count of `PENDING` non-expired candidates; `platform` is optional filter.
- **Definition of done:** unit tests cover: `push` creates row; `depth` counts correctly; `popTop` returns highest-priority non-expired candidate and marks it `RESERVED`; `popTop` returns `null` on empty stack; `popTop` skips expired candidates; `expire` marks stale rows and returns count; typecheck passes.
- **Out of scope:** publishing, cron wiring, slot scheduling (slice 2.5+).

#### Slice 2.3 — Prisma: `cadence_config` + migration
- **Goal:** add the `ap_cadence_config` table that drives the slot scheduler — one row per `(tenant, platform)` storing posting frequency, preferred times, timezone, and pause state.
- **Depends on:** 2.1 (Organization ap_ back-relation pattern), 1.1 (ApUpdatedBy/ApGrowthRuleSource pattern for source enum).
- **Files touched:** `schema.prisma` (new model `ApCadenceConfig` + enum `ApCadenceConfigSource` + `Organization` back-relation); `pnpm prisma-db-push`; `pnpm prisma-generate`.
- **Columns:**
  - `id` — UUID PK
  - `organizationId` — FK → Organization
  - `platform` — String (e.g. `'twitter'`, `'linkedin'`)
  - `postsPerDay` — Int default `1`; target posts per calendar day
  - `preferredTimes` — Json default `"[]"`; array of `"HH:MM"` strings (24h UTC) for preferred slot times; slot scheduler picks from this list when materializing
  - `timezone` — String default `"UTC"`; IANA timezone used when converting `preferredTimes` to UTC slot datetimes
  - `pausedUntil` — `DateTime?`; null means active; non-null means paused until this timestamp; slice 2.12 adds the pause/resume skill that writes this
  - `active` — Boolean default `true`; false = platform excluded from all scheduling
  - `source` — `ApCadenceConfigSource` enum: `AI | USER | DEFAULT`; tracks who last set this config
  - `version` — Int default `1`; increment on every write so the proposal applier can do optimistic versioning (user edits win per project principle)
  - `createdAt` — `DateTime @default(now())`
  - `updatedAt` — `DateTime @updatedAt`
- **Constraints/Indexes:**
  - `@@unique([organizationId, platform])` — one config per tenant+platform
- **Definition of done:** `db push` applies cleanly; Prisma client includes `apCadenceConfig` accessor; `ApCadenceConfigSource` enum exported; `Organization` model has `apCadenceConfig ApCadenceConfig[]` back-relation.
- **Out of scope:** any service code, slot scheduler, pause/resume skill.

#### Slice 2.4 — Prisma: `scheduled_slots` + migration
- **Goal:** add the `ap_scheduled_slot` table that holds materialized future posting windows — one row per `(tenant, platform, scheduledAt)` time point generated by the slot scheduler cron.
- **Depends on:** 2.3 (`ApCadenceConfig` schema pattern), 2.1 (`ApPostCandidate` back-relation for optional FK).
- **Files touched:** `schema.prisma` (new model `ApScheduledSlot` + enum `ApScheduledSlotStatus` + `Organization` + `ApPostCandidate` back-relations); `pnpm prisma-db-push`; `pnpm prisma-generate`.
- **Columns:**
  - `id` — UUID PK
  - `organizationId` — FK → Organization
  - `platform` — String
  - `scheduledAt` — DateTime; the exact UTC moment this slot should fire
  - `status` — `ApScheduledSlotStatus` enum: `PENDING | TRIGGERED | SKIPPED | CANCELLED`; default `PENDING`
  - `postCandidateId` — `String?`; FK → `ApPostCandidate`; null at creation; filled by pop-and-publish (slice 2.6) when the slot fires and a candidate is bound
  - `metadata` — Json default `"{}"` ; reserved for scheduler notes (e.g. why a slot was skipped)
  - `createdAt` — `DateTime @default(now())`
  - `updatedAt` — `DateTime @updatedAt`
- **Indexes:**
  - `@@index([organizationId, platform, scheduledAt, status])` — primary scheduler query: fetch next PENDING slot per (org, platform)
  - `@@index([scheduledAt, status])` — global cron sweep: find all PENDING slots due now across all tenants
- **Definition of done:** `db push` applies cleanly; Prisma client includes `apScheduledSlot` accessor; `ApScheduledSlotStatus` enum exported; `Organization` model has `apScheduledSlot ApScheduledSlot[]` back-relation; `ApPostCandidate` model has `apScheduledSlot ApScheduledSlot[]` back-relation.
- **Out of scope:** scheduler cron (slice 2.5), pop-and-publish (slice 2.6), any service logic.

#### Slice 2.6 — Pop-and-publish integration with Postiz publisher

- **Goal:** Create a cron task that sweeps PENDING `ApScheduledSlot` rows whose `scheduledAt ≤ now()`, pops the top candidate from the stack for each `(org, platform)`, creates a Postiz `Post` row, emits it to the BullMQ `'post'` queue, and records the result in `ap_published_posts`.
- **Depends on:** 2.5 (`ApScheduledSlot` table + `SlotSchedulerService`), 2.2 (`popTop`), 2.7 (`ApPublishedPost` table — done in same session).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/stack/pop-and-publish.service.ts` — new `@Injectable()` service
  - `apps/cron/src/tasks/trigger-due-slots.ts` — new `@Cron('* * * * *')` task
  - `apps/cron/src/cron.module.ts` — register new providers
- **Flow per due slot:**
  1. Atomically claim the slot: `apScheduledSlot.updateMany({ where: { id, status: PENDING }, data: { status: TRIGGERED } })`. If `count=0`, skip (already claimed by concurrent runner).
  2. Find first usable `Integration` for `(organizationId, providerIdentifier = platform)` where `disabled=false`, `refreshNeeded=false`, `deletedAt=null`.
  3. `popTop(prisma, org, platform)` — atomically reserve a candidate.
  4. If no integration or no candidate → revert slot to `SKIPPED` with `metadata.skipReason`.
  5. If both found:
     - `prisma.post.create({ state:'QUEUE', publishDate: slot.scheduledAt, organizationId, integrationId, content: candidate.content, group: makeId(10) })`
     - `bullMq.emit('post', { id: post.id, options:{ delay:0 }, payload:{ id: post.id } })`
     - Update slot: `{ postCandidateId: candidate.id }` (already TRIGGERED from step 1)
     - Update candidate: `{ status: PUBLISHED }`
     - `prisma.apPublishedPost.create({ organizationId, platform, postCandidateId, scheduledSlotId, postizPostId, publishedAt })`
- **Definition of done:** `PopAndPublishService.triggerDueSlots()` compiles; cron task registered; concurrent-claim logic prevents double-processing; typecheck passes for touched packages.
- **Out of scope:** retry logic on Postiz publish failure, stock-depth enforcement (slice 2.10), evergreen fallback (slice 2.11).

#### Slice 2.7 — Prisma: `published_posts` + migration

- **Goal:** Add the `ap_published_posts` table that records each autopilot publishing event — linking a candidate, a slot, and the resulting Postiz Post id.
- **Depends on:** 2.4 (`ApScheduledSlot`), 2.1 (`ApPostCandidate`).
- **Files touched:** `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (new model `ApPublishedPost` + back-relations on `Organization`, `ApPostCandidate`, `ApScheduledSlot`); `pnpm prisma-db-push`; `pnpm prisma-generate`.
- **Columns:**
  - `id` — UUID PK
  - `organizationId` — FK → Organization
  - `platform` — String
  - `postCandidateId` — String FK → ApPostCandidate
  - `scheduledSlotId` — String? FK → ApScheduledSlot (null if published without a slot)
  - `postizPostId` — String (the Postiz `Post.id` created for this publish event)
  - `publishedAt` — DateTime @default(now())
  - `releaseUrl` — String? (filled later when Postiz returns the platform URL)
  - `metadata` — Json @default("{}")
  - `createdAt` — DateTime @default(now())
- **Indexes:**
  - `@@index([organizationId, publishedAt])` — per-tenant audit queries
  - `@@index([postCandidateId])` — look up publish record from a candidate
- **Definition of done:** `db push` applies cleanly; Prisma client includes `apPublishedPost` accessor; `Organization` has `apPublishedPost ApPublishedPost[]` back-relation; `ApPostCandidate` has `apPublishedPost ApPublishedPost[]` back-relation; `ApScheduledSlot` has `apPublishedPost ApPublishedPost?` back-relation.
- **Out of scope:** any UI surface, release URL back-fill (slice 4.1+).

#### Slice 2.8 — Stock keeper agent skeleton

- **Goal:** define the `stockKeeperAgent` (`AgentDefinition`) that monitors per-(tenant, platform) stack depth and signals when the candidate queue has dropped below its minimum threshold.
- **Depends on:** 2.2 (`depth()` primitive), 0.6 (AgentDefinition types).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/agents/stock-keeper.ts` — new agent file
  - `libraries/nestjs-libraries/src/autopilot/agents/stock-keeper.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/agents/index.ts` — re-export
- **Exported API:**
  - `assessStock(input: StockKeeperInput): StockKeeperOutput` — pure synchronous depth check; exported separately so the depth-enforcer service (2.10) can call it without a full `AgentContext`.
  - `runStockKeeper(ctx: AgentContext, input: StockKeeperInput): Promise<StockKeeperOutput>` — async `AgentDefinition`-compatible wrapper.
  - `stockKeeperAgent: AgentDefinition<StockKeeperInput, StockKeeperOutput>` — registry entry.
  - `StockKeeperInput { tenantId, platform, currentDepth, minDepth }`, `StockKeeperOutput { action: 'ok'|'refill', tenantId, platform, currentDepth, minDepth, deficit }`.
- **Skeleton note:** `run()` performs pure math (no LLM call). The system prompt is written for Phase 3 when the copywriter agent will be invoked on `'refill'` signals.
- **Definition of done:** unit tests cover ok/refill boundary; `stockKeeperAgent` smoke test verifies shape; typecheck passes.
- **Out of scope:** LLM-based topic recommendation, copywriter invocation (Phase 3).

#### Slice 2.9 — Stale candidate sweeper cron

- **Goal:** a scheduled cron that globally expires PENDING `ApPostCandidate` rows whose `expiresAt` has passed, across all tenants.
- **Depends on:** 2.2 (`expire()` primitive).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/stack/stale-sweeper.service.ts` — thin NestJS injectable wrapping `expire(db)` (no tenantId = global sweep)
  - `apps/cron/src/tasks/sweep-stale-candidates.ts` — `@Cron('30 * * * *')` task (every hour at :30, offset from materialize-slots which runs at :00)
  - `apps/cron/src/cron.module.ts` — add `StaleSweeperService` + `SweepStaleCandidates` to `providers`
- **Definition of done:** cron task registered; `StaleSweeperService.sweepAll()` calls `expire()` globally; only logs when count > 0; typecheck passes.
- **Out of scope:** per-tenant sweeping (the global `expire()` with no tenantId already handles all tenants).

#### Slice 2.10 — Stack depth enforcement

- **Goal:** a scheduled service that checks every active (org, platform) pair against a minimum depth threshold, logs deficits, and emits `StockKeeperOutput` signals for future wiring to the copywriter.
- **Depends on:** 2.2 (`depth()`), 2.3 (`ApCadenceConfig`), 2.8 (`assessStock`).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/stack/depth-enforcer.service.ts` — `@Injectable()` with `enforceAll(): Promise<EnforceAllResult>`
  - `apps/cron/src/tasks/enforce-stack-depth.ts` — `@Cron('*/15 * * * *')` task (every 15 minutes)
  - `apps/cron/src/cron.module.ts` — add `DepthEnforcerService` + `EnforceStackDepth` to `providers`
- **Threshold formula:** `minDepth = max(MIN_STACK_ABSOLUTE=3, postsPerDay × MIN_STACK_DAYS_BUFFER=2)`. Both constants exported from the service file.
- **Exported API from depth-enforcer.service.ts:**
  - `MIN_STACK_ABSOLUTE: 3`, `MIN_STACK_DAYS_BUFFER: 2`
  - `EnforceAllResult { configs, ok, deficits, signals: StockKeeperOutput[] }`
  - `DepthEnforcerService.enforceAll(): Promise<EnforceAllResult>` — read-only; no writes; safe to call concurrently.
- **Definition of done:** service fetches active cadence configs, checks depth per pair, calls `assessStock`, logs `warn` for each deficit (with note that copywriter wired in Phase 3); cron task registered; typecheck passes.
- **Out of scope:** actually invoking the copywriter or any write path (Phase 3).

#### Slice 2.11 — Evergreen fallback pool seed + retrieval

- **Goal:** a permanent evergreen content pool (never depleted) that `PopAndPublishService` falls back to when the regular stack is empty. Provides two capabilities: seeding the pool with long-lived fallback posts, and retrieving one for immediate use while transparently restoring the pool.
- **Depends on:** 2.2 (`push`, `ApPostCandidateStatus`), 2.6 (`PopAndPublishService` — to wire fallback in).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/stack/evergreen-pool.service.ts` — new `@Injectable()` service
  - `libraries/nestjs-libraries/src/autopilot/stack/evergreen-pool.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/stack/pop-and-publish.service.ts` — inject `EvergreenPoolService`; call `pickFallback` when `popTop` returns null
  - `apps/cron/src/cron.module.ts` — add `EvergreenPoolService` to `providers`
- **Design notes:**
  - Evergreen candidates are ordinary `ApPostCandidate` rows with `source='evergreen'`, `expiresAt=null` (immune to stale sweeper), `priority=-1` (lower than regular posts — consumed last by `popTop`).
  - **`seedEvergreen(tenantId, platform, content, options?)`** — thin wrapper over `push()` enforcing `source='evergreen'`, `expiresAt=null`, `priority=-1`. Caller may override priority.
  - **`pickFallback(tenantId, platform)`** — atomically finds the oldest PENDING evergreen candidate (FOR UPDATE SKIP LOCKED), marks it RESERVED, immediately creates a fresh PENDING clone (same content/metadata), returns the RESERVED row. Pool size stays constant. Returns null if pool is empty.
  - **`poolSize(tenantId, platform)`** — count of PENDING evergreen candidates.
  - `PopAndPublishService._processSlot` step 3: if `popTop` returns null → try `pickFallback`. If still null → SKIPPED with `skipReason='empty_stack_no_evergreen'`. If evergreen found → same publish flow as a regular candidate.
- **Exported API from evergreen-pool.service.ts:**
  - `EvergreenPoolService.seedEvergreen(tenantId, platform, content, options?): Promise<ApPostCandidate>`
  - `EvergreenPoolService.pickFallback(tenantId, platform): Promise<ApPostCandidate | null>`
  - `EvergreenPoolService.poolSize(tenantId, platform): Promise<number>`
- **Definition of done:** `seedEvergreen` creates a row; `pickFallback` on empty pool returns null; `pickFallback` returns RESERVED item and pool count stays the same (clone created); `poolSize` counts correctly; `popTop` naturally prefers priority-0 candidates over priority-(-1) evergreen; `pop-and-publish` uses fallback when stack is empty; typecheck passes; all autopilot tests green.
- **Out of scope:** UI to manage the evergreen pool, per-platform pool rotation strategy (Phase 3).

### Phases 2–9 — summarized

Later phases list slice IDs and one-line goals in §Status tracker. **Before starting any slice in Phase 2+, expand it in this file** with the same structure used above (Goal / Depends on / Files / Definition of done / Out of scope). That expansion is itself the first activity of the session; commit it separately from implementation if helpful.

This keeps the guide from bloating with pre-written detail that would drift before it's used.

---

## Build log

Append-only. One line per slice completed (or partially completed). Newest at bottom.

```
# YYYY-MM-DD | slice-id | outcome | files-touched
```

<!-- entries begin -->
2026-04-15 | 0.0 | done | coding_guide.md
2026-04-15 | 0.1 | done | libraries/helpers/src/configuration/configuration.checker.ts, apps/backend/src/main.ts, .env.example
2026-04-15 | 0.2 | done | libraries/nestjs-libraries/src/autopilot/ (14 index.ts placeholders), tsconfig.base.json
2026-04-15 | 0.3 | done | autopilot/skills/types.ts (new), autopilot/skills/index.ts
2026-04-15 | 0.4 | done | autopilot/tiers.ts (new)
2026-04-15 | 0.5 | done | autopilot/skill-costs.ts (new)
2026-04-15 | 0.6 | done | autopilot/agents/types.ts (new), autopilot/agents/index.ts
2026-04-15 | 0.7 | done | schema.prisma (ApCreditLedger model + ApCreditLedgerReason enum + Organization back-relation); db push applied; client regenerated
2026-04-15 | 0.8 | done | schema.prisma (ApActivityLog model + ApActivityLogStatus enum + Organization/User back-relations); db push applied; client regenerated
2026-04-15 | 0.9 | done | schema.prisma (ApCapabilityGap model + Organization back-relation); db push applied
2026-04-15 | 0.10 | done | schema.prisma (ApChatMessage model + ApChatMessageRole/Source enums + Organization back-relation); db push applied
2026-04-15 | 0.11 | done | autopilot/encryption/index.ts (AES-256-GCM); index.spec.ts (6 tests pass); libraries/nestjs-libraries/jest.config.js (ts-jest setup)
2026-04-15 | 0.12 | done | schema.prisma (ApPlatformKey model + Organization back-relation); db push applied; autopilot/platform_keys/index.ts (set/get/del); index.spec.ts (7 tests pass)
2026-04-15 | 0.13 | done | autopilot/pipeline.ts (PipelineContext/Result types, plan gate, credit gate, skill dispatch, stubs for 0.14/0.15); registerSkillGate() exported; pipeline.spec.ts (9 tests pass)
2026-04-16 | 0.14 | done | credits/index.ts (getBalance, debitCredits, grantCredits); activity/index.ts (logActivity); pipeline.ts stubs replaced with real helpers + userMessage added to PipelineContext; credits/index.spec.ts (17 tests), activity/index.spec.ts (3 tests), pipeline.spec.ts updated (13 tests)
2026-04-16 | 0.15 | done | capability_gaps/index.ts (logGap); pipeline.ts wired to logGap on plan_gate + insufficient_credits; capability_gaps/index.spec.ts (3 tests)
2026-04-16 | 0.16 | done | autopilot/llm.ts (selectModel, createLlmProvider, DEFAULT_MODEL_PREFERENCE); skills/types.ts (LlmProvider updated to real LanguageModel from ai-v5, LlmCompleteOptions); llm.spec.ts (6 tests pass); pipeline.spec.ts mock updated; all 56 autopilot tests green
2026-04-16 | 0.17 | done | schema.prisma (ApDiscount, ApDiscountApplication + ApDiscountAmountType enum + Organization back-relations); db push applied; client regenerated
2026-04-16 | 0.18 | done | autopilot/discount/index.ts (resolveDiscount, applyDiscount, listActive); discount/index.spec.ts (14 tests pass); all 70 autopilot tests green
2026-04-16 | 0.19 | done | autopilot/webhooks/paypal.ts (PaypalWebhookService: verifySignature via PayPal API, handleEvent no-op switch); apps/backend/src/api/routes/paypal-webhook.controller.ts; api.module.ts updated (public route, not authenticated)
2026-04-16 | 0.20 | done | schema.prisma (ApSubscription + ApInvoice + ApBillingCycle/ApSubscriptionStatus/ApInvoiceStatus enums + Organization back-relations); db push applied; client regenerated; @@map("ap_subscriptions") avoids clash with Postiz Subscription model
2026-04-16 | 1.1 | done | schema.prisma (ApBusinessProfile + ApGrowthRule + ApUpdatedBy/ApGrowthRuleSource enums + Organization back-relations); db push applied; client regenerated
2026-04-16 | 1.2 | done | schema.prisma (ApConfigChangeProposal + ApProposalStatus enum + Organization + ApChatMessage back-relations); db push applied; client regenerated
2026-04-16 | 1.3 | done | autopilot/agents/intent_parser.ts (parseIntent, intentParserAgent); intent_parser.spec.ts (13 tests pass)
2026-04-16 | 1.4 | done | autopilot/chat/proposals.ts (createProposal, listPending, confirm, cancel, registerApplier; business_profile + growth_rule appliers); proposals.spec.ts (15 tests pass); chat/index.ts re-exports; all 98 autopilot tests green
2026-04-16 | 1.5 | done | schema.prisma (previewFeatures=postgresqlExtensions; extensions=pgvector; ApMemoryVectorKind enum; ApMemoryVector model + Organization back-relation; Unsupported("vector(1536)") embedding); db push applied; IVFFLAT index created manually via postgres superuser; client regenerated
2026-04-16 | 1.6 | done | llm.ts (selectEmbeddingModel, embedText using @ai-sdk/openai text-embedding-3-small); autopilot/memory/index.ts (getStructuredProfile, writeVector, queryVector via $queryRaw cosine-ops, listRecent, ensureVectorIndex); memory/index.spec.ts (8 tests pass); all 106 autopilot tests green
2026-04-18 | 1.7 | done | autopilot/agents/memorist.ts (runMemorist, memoristAgent; store/skip/update decisions via generateObject); memorist.spec.ts (11 tests pass); agents/index.ts updated
2026-04-18 | 1.8 | done | autopilot/chat/chat.service.ts (AutopilotChatService; SSE emit pattern; streamText for text responses, createProposal for config intents); apps/backend/src/api/routes/autopilot-chat.controller.ts (POST /autopilot/chat, text/event-stream); api.module.ts updated (AutopilotChatController + AutopilotChatService); chat/index.ts updated; all 117 autopilot tests green
2026-04-18 | 1.9 | done | apps/frontend/src/components/autopilot/chat-layout.tsx (AutopilotChatLayout: welcome state, starter chips, ChatBubble, textarea input, send button; local state only); apps/frontend/src/app/(app)/(site)/autopilot/page.tsx (route); components/layout/top.menu.tsx (Autopilot nav item added at top of firstMenu); typecheck green
2026-04-18 | 1.10 | done | apps/frontend/src/components/autopilot/card-select.tsx (CardSelect: options, onSelect, optional selectedId/title/disabled; controlled + uncontrolled; keyboard accessible); typecheck green
2026-04-18 | 1.11 | done | apps/frontend/src/components/autopilot/chat-layout.tsx (SSE streaming, proposal/error bubbles, starter chips); apps/backend/src/api/routes/autopilot-chat.controller.ts (confirm/cancel routes); libraries/nestjs-libraries/src/autopilot/chat/chat.service.ts (confirmProposal, cancelProposal); typecheck green
2026-04-19 | 1.12 | done | autopilot/agents/onboarding.ts (analyzeOnboarding, buildOnboardingReplyPrompt, onboardingAgent); chat/chat.service.ts (first-run detection, onboarding routing, _loadOnboardingHistory); agents/index.ts updated; chat-layout.tsx (starter prompts updated); typecheck green
2026-04-19 | 2.1 | done | schema.prisma (ApPostCandidate + ApPostCandidateStatus enum + Organization back-relation); db push applied; client regenerated
2026-04-19 | 2.2 | done | autopilot/stack/index.ts (push, popTop, expire, depth; SELECT FOR UPDATE SKIP LOCKED in popTop); stack/index.spec.ts (18 tests pass); all 135 autopilot tests green
2026-04-19 | 2.3 | done | schema.prisma (ApCadenceConfig + ApCadenceConfigSource enum + Organization back-relation); db push applied; client regenerated
2026-04-19 | 2.4 | done | schema.prisma (ApScheduledSlot + ApScheduledSlotStatus enum + Organization back-relation + ApPostCandidate back-relation); db push applied; client regenerated
2026-04-19 | 2.5 | done | autopilot/stack/slot-scheduler.service.ts (wallClockToUtc, buildSlotHHMMs, SlotSchedulerService); stack/slot-scheduler.spec.ts (22 tests); apps/cron/src/tasks/materialize-slots.ts; apps/cron/src/cron.module.ts updated; all 157 autopilot tests green
2026-04-19 | 2.7 | done | schema.prisma (ApPublishedPost + Organization/ApPostCandidate/ApScheduledSlot back-relations); db push applied; client regenerated
2026-04-19 | 2.6 | done | autopilot/stack/pop-and-publish.service.ts (PopAndPublishService: atomic slot claim, integration lookup, popTop, Post create, BullMQ emit, apPublishedPost record); apps/cron/src/tasks/trigger-due-slots.ts (@Cron every minute); apps/cron/src/cron.module.ts updated; typecheck green
2026-04-20 | 2.8 | done | autopilot/agents/stock-keeper.ts (assessStock, runStockKeeper, stockKeeperAgent); agents/stock-keeper.spec.ts (13 tests pass); agents/index.ts updated; all 170 autopilot tests green
2026-04-20 | 2.9 | done | autopilot/stack/stale-sweeper.service.ts (StaleSweeperService.sweepAll wraps expire()); apps/cron/src/tasks/sweep-stale-candidates.ts (@Cron hourly at :30); cron.module.ts updated
2026-04-20 | 2.10 | done | autopilot/stack/depth-enforcer.service.ts (DepthEnforcerService.enforceAll; MIN_STACK_ABSOLUTE=3, MIN_STACK_DAYS_BUFFER=2; calls assessStock per active cadence config); apps/cron/src/tasks/enforce-stack-depth.ts (@Cron every 15 min); cron.module.ts updated; typecheck green
2026-04-20 | 2.11 | done | autopilot/stack/evergreen-pool.service.ts (EvergreenPoolService: seedEvergreen, pickFallback clone-restore pattern, poolSize); evergreen-pool.spec.ts (17 tests pass); pop-and-publish.service.ts updated (pickFallback fallback after empty popTop; skipReason='empty_stack_no_evergreen'); cron.module.ts updated; 187 autopilot tests green; typecheck green
<!-- entries end -->

---

## Carry-over

Anything partially finished from the last session. Clear when picked up.

<!-- carry-over begin -->
<!-- carry-over end -->

---

## Blockers

Open issues that prevent forward progress. Clear when resolved.

<!-- blockers begin -->
<!-- blockers end -->

---

## Change log (meta)

Changes to this guide itself (new slices added, slice reshaped, conventions updated). Keep it short.

<!-- meta begin -->
- created — initial skeleton, Phase 0 + Phase 1 fully specified, Phases 2–9 listed only.
<!-- meta end -->
