# Autopilot Scheduling — Architecture Reference

## Two Scheduling Modes

The autopilot supports two coexisting ways to schedule posts. Both are
managed through the same `ap_post_candidate` + `ap_scheduled_slot` tables,
distinguished by the candidate's `status` field and whether the slot has a
`postCandidateId` pre-assigned.

---

### Stack Mode (default)

Posts queue up independently of their publish times. Time slots fire and
pick whichever post is on top of the stack at that moment.

```
ap_post_candidate  (status = PENDING, postCandidateId unset on slot)
       ↓ popTop() at fire time
ap_scheduled_slot  (postCandidateId = null)
       ↓ TriggerDueSlots cron
publish → Postiz Post row → BullMQ 'post' queue
```

**Use when:** "post my next scheduled item every day at 9 am" — the
exact content is unimportant, any pending post will do.

---

### Per-Post Mode (pinned)

A specific post is pre-assigned to a specific slot at creation time. The
slot will only ever publish that one post.

```
ap_post_candidate  (status = SCHEDULED)
       ↑ pre-linked at creation
ap_scheduled_slot  (postCandidateId = candidate.id)
       ↓ TriggerDueSlots cron
publish → Postiz Post row → BullMQ 'post' queue
```

**Use when:** "schedule this exact post about our product launch for
Friday 3 pm" — specific content, specific time.

**Key invariant:** `SCHEDULED` candidates are invisible to `popTop` (which
only selects `PENDING`). They cannot be stolen by a stack-mode slot.

---

## Status lifecycle

```
PENDING   → eligible for stack-mode popTop
SCHEDULED → reserved for a specific slot; invisible to stack pops
RESERVED  → actively being processed by the cron (transient, seconds)
PUBLISHED → done
EXPIRED   → expiresAt passed before publishing
FAILED    → publish error
```

When a per-post slot is **cancelled**, its linked candidate reverts from
`SCHEDULED` → `PENDING`, returning it to the stack.

---

## Database tables

| Table | Role |
|---|---|
| `ap_post_candidate` | Content units — the stack or per-post candidates |
| `ap_scheduled_slot` | Fire times — bare (stack) or pre-linked (per-post) |
| `ap_cadence_config` | Recurring schedule — postsPerDay + preferredTimes per platform |
| `ap_published_post` | Audit log of published posts |

---

## Cron pipeline

```
SlotSchedulerService (every hour)
  reads ap_cadence_config → materialises future ap_scheduled_slot rows

TriggerDueSlots (every minute)
  finds PENDING slots with scheduledAt ≤ now
  → per-post: uses pre-linked SCHEDULED candidate
  → stack:    calls popTop() for highest-priority PENDING candidate
  → fallback: EvergreenPoolService if stack is empty
  → creates Postiz Post row + emits to BullMQ
```

---

## Configurable entities and defaults

Every item here is editable both via AI chat and the `/config` page.

| Entity | Field | Default |
|---|---|---|
| `Organization` | `timezone` | `"UTC"` |
| `ap_cadence_config` | `postsPerDay` | `1` |
| `ap_cadence_config` | `preferredTimes` | `[]` (no fixed times, spread evenly) |
| `ap_cadence_config` | `active` | `true` |
| `ap_cadence_config` | `pausedUntil` | `null` |
| `ap_business_profile` | `niche` | `""` |
| `ap_business_profile` | `brandVoiceShort` | `""` |
| `ap_business_profile` | `brandVoiceExtended` | `""` |
| `ap_business_profile` | `goals` | `[]` |
| `ap_business_profile` | `antiPatterns` | `[]` |
| `ap_business_profile` | `regulatoryFlags` | `[]` |
| `ap_growth_rule` | (list) | `[]` |
| `ap_tenant_strategy_optout` | `optedOut` | `false` (contributing) |
| `ap_memory_vector` | (list) | `[]` |

---

## Config page tabs

| Tab | Entity | Notes |
|---|---|---|
| Post Stack | `ap_post_candidate` | PENDING + SCHEDULED candidates |
| Scheduled | `ap_scheduled_slot` | Upcoming PENDING slots with type badge |
| Cadence | `ap_cadence_config` | Per-platform, defaults shown if no row |
| Profile | `ap_business_profile` | Brand voice, goals, constraints |
| Rules | `ap_growth_rule` | Active growth rules with toggle |
| Memory | `ap_memory_vector` | Long-term AI memories, deletable |
| Strategy | `ap_tenant_strategy_optout` | Data contribution toggle |
| Timezone | `Organization.timezone` | IANA timezone picker |
