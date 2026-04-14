# Project Plan — AI Social Media Autopilot

**Base:** hard fork of Postiz. No upstream obligation. We modify Postiz core freely.
**Status:** design phase. No implementation yet. This document is the authoritative blueprint; update it before writing code.

---

## 1. Vision

A social media autopilot that grows a business on social media. The user's only UI is a chatbot that behaves like a senior social media manager employee: it asks for what it needs, makes decisions on its own, explains its plan-gated limits professionally, and executes end-to-end. The owner pays; the manager produces results.

Postiz gives us the publishing substrate (auth, OAuth for ~14 platforms, BullMQ workers, Prisma, cron, media handling). We layer the autopilot on top.

## 2. Non-negotiable principles

1. **Chatbot is the only primary UI.** Calendar/settings/logs exist but are hidden; surfaced on request ("show me this week's schedule", "email me a report").
2. **No on-the-fly AI decisions at execution time.** Every autonomous decision is pre-computed and stored as a DB row before the job runs. The executor only reads rows.
3. **User always wins.** User chat instructions override AI decisions; planner re-reads user edits on next cycle.
4. **AI serves as slave.** The orchestration never refuses a user request. Only the underlying LLM can refuse; the AI surfaces that refusal verbatim.
5. **AI warns once, then complies.** If a user instruction contradicts a known growth rule, the AI states the tradeoff in one message, then obeys.
6. **Confirm before writing config.** Predictable choices use card-select UI. Free-form changes use yes/edit/cancel.
7. **Stack-based publishing.** No fixed schedule of content. Cadence decides *when*; the stack decides *what*. Posts never stop unless the user says "stop."
8. **The stack cannot be empty.** Stock keeper guarantees fill. Slots never skip unless the user explicitly pauses.
9. **Every action logs cost, tokens, model, time.** Activity log is append-only, queryable, and drives pricing calibration.
10. **Every unmet request becomes a dev ticket.** Capability gap log is the backlog.
11. **Cross-tenant learning on strategy only, never content.** Patterns are anonymized structural features.
12. **Credit-gated before plan-gated.** If a user has credits, they can try the feature. Let them feel the power.
13. **Postiz auth stays.** No Clerk. Extension pairs via same session.

## 3. Product shape

- **Multi-tenant SaaS.** Users register → onboard → set platform keys → pay/use free credits → use.
- **Hosting:** self-hosted infrastructure, local Postgres (not managed remote), Redis, Node services.
- **Platform keys:** per-tenant, encrypted at rest in DB.
- **LLM keys:** env-level for now. DB column + code path reserved so tenants can bring their own key later. Not wired in MVP.
- **Pricing:** credit-based with monthly renewal. Free tier gets a real one-time credit grant so users experience power.
- **Payment:** PayPal integration. Subscription + one-time credit purchase flows.
- **Discount system:** standalone module that understands *amount, applicability, validity* — agnostic to origin. Yearly plans (flat 30% off) and affiliate codes both produce discount records through the same system.
- **Affiliate MVP:** code grants discount on signup. No referral payout system in MVP — reserved as backlog.

## 4. Tier/plan registry

- Lives in `tiers.ts` (TypeScript, dev-editable, type-safe).
- Shape per tier: `{ id, name, monthly_credits, price_monthly, price_yearly, hard_features: [], default_limits: { posts_per_platform_per_month, stack_depth_min, ... } }`.
- "Hard features" are binary unlocks (e.g., future video generation). Everything else is credit-gated.
- Proposed MVP tiers (dev can tune freely):
  - **Free:** one-time 500 credits, extension allowed, no article ingestion, no Apify deep research.
  - **Starter:** monthly credits, all core features, all platforms, article ingestion, Apify basic.
  - **Pro:** higher monthly credits, Apify deep research, priority queues. Video generation reserved for Pro when implemented.

## 5. Credit system

- **Unit:** 1 credit internally pegged to ≈ $0.01 (not shown to users).
- **Costs live in `skill-costs.ts`.** Each skill declares an integer credit cost. Developer edits this file to tune pricing.
- **Pre-flight pipeline before every skill:**
  1. Plan feature gate (for hard-locked features).
  2. Credit balance gate.
  3. LLM call (only if both pass).
  4. Post-call: record actual token cost + $ spent in activity log; deduct declared credits from tenant ledger.
- **Actual vs. declared reconciliation** runs periodically (cron job) to flag skills where actual cost drifts from declared — dev updates `skill-costs.ts`.
- **On limit hit:** friendly upgrade prompt in chat every time. Copy suggests the specific tier that unlocks/extends the action.

## 6. Tech stack decisions

- **Agent framework:** Vercel AI SDK for the LLM layer (multi-provider, tool calling, streaming, schema-validated outputs). Custom orchestration on top for skill registry, sub-agent dispatch, DB-backed plans, credit pipeline, memory retrieval.
- **Vector store:** pgvector in the same Postgres instance. Single DB, single backup, single ACID boundary. Abstraction thin enough to swap later if scale demands.
- **Search / research:** Tavily for web search, Apify for structured scraping and deep competitive analysis.
- **Queue:** keep Postiz's BullMQ.
- **Payments:** PayPal.
- **Telegram:** official Bot API; tenant pairs their Telegram account via chat command/web settings.

## 7. Data model

### Tenant-facing structured tables

- `business_profile` — name, niche, goals, brand voice (short + extended), anti-patterns, regulatory flags.
- `platform_accounts` — per tenant per platform: OAuth tokens, account metadata, active/inactive, connected_at.
- `platform_keys` — encrypted per-tenant API/OAuth secrets for platforms that require them.
- `growth_rules` — per-tenant overrides of global best practices ("never post raw links", configurable list).
- `cadence_config` — per tenant per platform: target frequency, window preferences, time-of-day hints. AI fills these initially; user can override via chat.
- `post_candidates` — the stack. Rows: `id, tenant_id, platform, body, media_refs, priority, source ('user' | 'ai'), source_message_id, created_at, expires_at, locked_by_user, status ('pending' | 'published' | 'rolled_back' | 'expired')`.
- `scheduled_slots` — materialized next-N slot times per platform per tenant. Regenerated by slot scheduler.
- `published_posts` — history, joins to `post_candidates`, stores platform post id, published_at, rollback fields, analytics snapshots.
- `activity_log` — append-only: `tenant_id, user_id, skill, llm_model, input_tokens, output_tokens, dollar_cost, credits_charged, status, created_at, metadata_json`.
- `credit_ledger` — credits granted, credits consumed, running balance, source references.
- `capability_gaps` — append-only log of unmet user requests for dev triage: `tenant_id, user_message, attempted_skills, reason, created_at`.
- `chat_messages` — conversational history: `tenant_id, role, content, source ('web' | 'telegram' | ...), created_at`.
- `config_change_proposals` — proposals generated from chat awaiting user confirmation, with expiration.

### Memory (vector)

- `memory_vectors` — tenant-scoped embeddings of: brand anecdotes, personal stories told by owner, post-performance learnings tagged for recall, strategic context. Each row includes `tenant_id, content, embedding, kind, source_ref, created_at`. Memorist agent decides what enters this table.

### Cross-tenant strategy (anonymized)

- `strategy_patterns` — no content, no tenant id in feature payload. Columns: `niche_tag, platform, hook_type, cta_type, length_bucket, media_type, time_of_day_bucket, performance_percentile, sample_size, created_at`.
- `tenant_strategy_optout` — tenants can opt out of contributing. Default is opt-in (see §11).

### Discount & billing

- `discounts` — standalone records: `id, amount_type ('percent' | 'flat'), amount, applicable_to, valid_from, valid_to, origin_note (free-text for bookkeeping)`. Origin-agnostic.
- `discount_applications` — which tenant/invoice used which discount.
- `subscriptions` — PayPal subscription id, tier, billing cycle, status.
- `invoices` — billing history.

## 8. Skill registry

- Each skill is a TypeScript module exporting:
  - `name`
  - `description` (shown to the LLM)
  - `input_schema` (zod)
  - `cost` (reference into `skill-costs.ts`)
  - `required_tier` (optional hard gate, rarely used)
  - `handler(input, ctx)` — executes the action, has access to DB, integrations, memory
  - `audit_shape` — what to log for this skill
- Registry loaded at boot; sub-agents receive filtered subsets per their scope.

**Initial skill set (non-exhaustive):**

- `push_to_stack(platform, body, media, priority)`
- `pop_and_publish(platform)` — internal, called by slot scheduler
- `rewrite_for_platform(draft, platform)`
- `generate_draft(topic, platform, constraints)`
- `research_topic(query, depth)` — Tavily
- `research_competitor(handle, platforms, depth)` — Apify
- `ingest_article(url)` — scrape + summarize + fan-out seed
- `propose_config_change(changes[])` — writes to `config_change_proposals`
- `apply_confirmed_config(proposal_id)`
- `generate_report(kind, range, channel)`
- `summarize_chat_to_memory(turn_ids)` — memorist internal
- `evaluate_post_performance(published_post_id)` — analyzer internal
- `extension_decide_on_post(post_payload)` — browser automation API endpoint handler
- `rollback_post(published_post_id, reason)`
- `pause_posting(tenant_id, until)` / `resume_posting(tenant_id)`

## 9. Sub-agent map

Each sub-agent = system prompt + scoped skill subset + shared memory read + own-table writes.

- **Intent parser** — every chat message passes through here. Classifies intent, extracts entities, drafts a config change proposal OR a direct action OR a question. Writes to `chat_messages`, `config_change_proposals`. Never mutates config directly.
- **Fan-out** — turns a user intent or external trigger (article ingested, news detected) into per-platform drafts pushed to stacks.
- **Copywriter** — platform-aware draft generation. Voice-consistent. Reads brand profile, memory, strategy patterns.
- **Stock keeper** — background. Keeps every active platform's stack above minimum depth. Refreshes stale items. Aggressive refill if depth critical.
- **Researcher** — Tavily + Apify. Competitive, news, topic research. Writes findings to memory when memorist approves.
- **Scheduler** — decides optimal slot times per cadence config. Uses audience analytics when available; sensible defaults otherwise.
- **Engagement** — powers browser automation API. Given a post payload, decides comment/reaction/hide/skip and returns the action object.
- **Memorist** — decides what conversational or event content is worth remembering. Writes to `memory_vectors`.
- **Analyzer** — reads `published_posts` + analytics. Extracts performance signals. Writes learnings to tenant memory and anonymized patterns to `strategy_patterns`.
- **Reporter** — renders charts, PDFs, text summaries on request; delivers through the configured channel (default email).

All sub-agents read full tenant memory. None copy content from cross-tenant sources — they consume strategy features only.

## 10. Stack-based publishing model

- **One stack per `(tenant, platform)`**, ordered by priority desc, created_at desc.
- **Cadence config** determines slot times; slot scheduler materializes the next N slots per platform.
- **Slot fires → pop top non-expired candidate → publish → delete from stack → record in `published_posts`.**
- No LLM call at publish time.
- **Stack minimum depth:** 5 candidates per active platform (configurable per tenant).
- **Candidate expiry:** default 14 days. Stock keeper refreshes expiring items (rewrite or discard+replace) before they lapse.
- **Stack never empty, posting never skipped.** Stock keeper has multiple fallback tiers:
  1. Generate on-topic fresh draft.
  2. Adapt/rewrite an existing evergreen memory item.
  3. Pull from a per-tenant evergreen safe-template pool (seeded during onboarding).
- **User random thought (chat/Telegram):** intent parser → fan-out → drafts → pushed with highest priority to each target platform stack. "Post only to YouTube and Facebook" narrows target set.
- **"Stop posting" / "pause until X":** user intent writes to `cadence_config.paused_until` per tenant or per platform. Slot scheduler respects it. Only a user unpause resumes.
- **Rollback:** delete from platform, mark `published_posts` row `rolled_back_at`, capture analytics snapshot, feed analyzer.

## 11. Memory system

Layers:

- **Structured profile** — `business_profile`, `growth_rules`, `cadence_config`. Queried directly by agents.
- **Conversational history** — `chat_messages`, recent window loaded into agent context; older turns summarized into memory by memorist.
- **Vector memory** — `memory_vectors`. Anecdotes, personal stories, brand voice examples, validated learnings, competitor insights.
- **Activity log** — `activity_log`. Queryable by reporter ("what did you do last week").
- **Cross-tenant strategy** — `strategy_patterns`. Read by copywriter/fan-out during generation.

Memorist policy:

- Listen to every chat turn and every significant event (published post, rollback, analytics crossing threshold).
- Decide store / skip / update.
- Tag entries with `kind` (anecdote, milestone, brand rule, learning, competitor intel, personal story).
- Freshness TTL per kind (personal stories forever, competitor intel short).

## 12. Cross-tenant learning

- Analyzer detects posts above performance percentile threshold.
- Extracts structural features only: hook type classification, CTA type, length bucket, media type, posting time bucket, niche tag.
- Writes anonymized row to `strategy_patterns`. No text, no tenant id in the feature record.
- Copywriter queries patterns matching `(niche, platform)` and treats them as a strategy prior — never as text to reproduce.
- **Opt-out:** available in settings. Default is opt-in; clear disclosure at signup. Reading is always allowed regardless of contribution.

## 13. Decision-before-action pattern

Every autonomous decision is reified as a row before execution:

- A post is a row in `post_candidates` before slot time.
- A cadence change is a row in `cadence_config` with `source, updated_by, version`.
- A research task is a job row with `plan_snapshot` and `decision_rationale`.
- User chat instruction → intent parser → proposal row → user confirms → applied via `apply_confirmed_config`.
- **Concurrency:** optimistic versioning per row; user-originated writes always win (planner re-reads and continues).

## 14. Chat UX patterns

- **Every config write confirms first.**
  - Predictable options → card-select UI ("Which tone: [Casual] [Professional] [Witty]").
  - Open-ended changes → yes/edit/cancel on the proposed change.
  - Batch related changes into a single confirm when possible ("I'm changing 3 things — ok?").
- **Plan-limit nudge:** friendly, specific, links to upgrade.
- **Source tracking:** every inbound message tagged `source: 'web' | 'telegram' | ...`. Downstream logic is identical regardless of source.
- **Reports on request:** inline chart, downloadable PDF, or email delivery. Default channel is email. User can configure Telegram/others later via chat ("send my weekly report to Telegram").

## 15. API surface

- **Chat endpoints:** message in, streamed response out. Internally dispatches to intent parser.
- **Config endpoints:** structured reads of cadence, growth rules, stack, profile. Writes only through the confirm pipeline (no direct PATCH from chat).
- **Reports endpoints:** generate/fetch.
- **Webhooks:** PayPal subscription events, Telegram inbound messages, article/RSS webhooks from tenant sites.
- **Browser automation API (`/browser_automation/*`):** reserved namespace. Returns decision objects. No build in MVP beyond the endpoint scaffolding and auth pairing. See §16.

## 16. Browser automation API

- Namespace reserved: `/browser_automation/*`.
- Auth: extension pairs with a Postiz tenant session via one-time code flow; gets an extension-scoped long-lived token. No Clerk.
- Input: post/comment payload + context.
- Output: decision object. Shape reserved and extensible — many action types may land here over time. Not building the action set in MVP; just reserving the namespace and auth flow.
- Backend is source-agnostic about *which* social account/session the extension operates on.

## 17. Telegram integration

- Tenant pairs a Telegram user to their account via settings → bot command.
- Inbound Telegram messages enter the same chat pipeline as web chat, tagged `source: 'telegram'`.
- No special skills; full functionality identical to web chat.
- Default report channel remains email; Telegram becomes an option once paired.

## 18. Reports

- Default channel: email. All reports also saved to DB.
- Default cadence: none (on request only) for MVP. Weekly digest is a stretch for MVP.
- Configurable per tenant: channel (email/Telegram), cadence (daily/weekly/monthly), content (summary/metrics/cost breakdown).
- Report generation is a skill; counts credits.

## 19. Background jobs

- **Slot scheduler** (cron) — materializes next slots; fires pop-and-publish.
- **Stock keeper** (cron + event-driven) — maintains stack depth and freshness per tenant per platform.
- **Stale candidate sweeper** — expires/rewrites items approaching `expires_at`.
- **Analyzer** (periodic) — pulls analytics, writes learnings + strategy patterns.
- **Memorist** (event-driven from chat) — processes new chat turns and events.
- **Cost reconciler** (daily) — compares declared credit costs with actual LLM spend; flags drift.
- **PayPal webhook handler** — subscription lifecycle.
- **Capability gap processor** — aggregates, dedupes, tags.

## 20. Rollback and learning flow

- Rollback: user or AI triggers → delete from platform → mark row → capture analytics snapshot → emit event to analyzer.
- Analyzer extracts reason + structural features → writes tenant learning to vector memory ("posts like X with feature Y flopped/succeeded").
- If crossing performance threshold (positive or negative), anonymized features land in `strategy_patterns`.
- Copywriter reads both tenant learnings and cross-tenant patterns on every generation.

## 21. Observability

- Every skill invocation writes `activity_log`: tenant, user (if direct), skill, LLM model, input/output tokens, dollar cost, declared credits, status, metadata.
- Owner-facing "what did you do" view is a read against activity_log filtered to user-relevant entries.
- Internal dashboards (for us): cost drift, stack health per tenant, capability gap trends, sub-agent error rates.

## 22. Capability gap tracking

- Any unmet user request (AI tried and failed, or no skill matched) writes a row in `capability_gaps` with the original message, attempted skills, reason.
- Internal review produces dev tickets. This is the primary product backlog input.

## 23. Auth

- Postiz's existing auth stays for web users.
- Telegram pairing: bot command + one-time token exchange.
- Browser extension pairing: web "connect extension" button → one-time code → extension exchanges for long-lived extension-scoped token tied to tenant org.
- No Clerk.

## 24. Postiz touchpoints

- **Scheduler:** integrates with Postiz publishing but pulls from our stack instead of Postiz's scheduled posts table. Postiz's publisher stays; we override the "what to publish next" source.
- **Integrations:** reuse entirely for OAuth + publishing per platform.
- **UI:** frontend mostly hidden behind a chatbot-first layout; existing screens remain reachable but not primary.
- **Auth:** reuse.
- **Media handling:** reuse.
- **BullMQ + cron:** reuse, add our own queues and cron jobs.

## 25. Phased roadmap (build order)

1. **Foundation:** encrypted per-tenant platform keys, credit ledger, tier registry, skill registry scaffolding, activity log, capability gap log, PayPal subscription.
2. **Chat core:** chat UI replacement, intent parser, config proposal/confirm pipeline, memory layers, memorist.
3. **Stack + scheduler:** `post_candidates` table, slot scheduler, stock keeper, pop-and-publish integration with Postiz publisher.
4. **Generation sub-agents:** copywriter, fan-out, researcher (Tavily first, Apify second).
5. **Learning loop:** analyzer, rollback flow, `strategy_patterns`.
6. **Reports:** on-request first, scheduled later. Email first, Telegram second.
7. **Telegram integration.**
8. **Browser automation API scaffolding + auth pairing** (no internal action logic beyond a first decision skill).
9. **Article ingestion** (paid-only).
10. **Optional later:** tenant BYO LLM key, video generation (Pro), referral payout for affiliates.

## 26. Open items (to resolve before specific slices)

- Exact MVP credit grants per tier — dev tunable; set initial values when billing lands.
- Time-of-day analytics source per platform — which integrations expose useful data natively vs. needing inference.
- Minimum viable brand-voice onboarding questions — tuning belongs to product design, not architecture.
- Concrete `skill-costs.ts` initial values — calibrate after first integration tests.
- Specific sub-agent system prompts — design when each sub-agent is built.

---

## Appendix A — Reserved namespaces

- `/browser_automation/*` — browser automation decision API.
- `/webhooks/paypal` — subscription lifecycle.
- `/webhooks/telegram` — inbound Telegram.
- `/webhooks/article-source` — tenant RSS/CMS push.

## Appendix B — Files and modules to exist (shape only)

- `tiers.ts` — tier definitions.
- `skill-costs.ts` — integer credit costs per skill.
- `skills/*.ts` — one file per skill; exports registry entry.
- `agents/*.ts` — one file per sub-agent; system prompt + scoped skill subset.
- `memory/*.ts` — read/write abstraction over structured + vector layers.
- `discount/*.ts` — standalone discount module, origin-agnostic.
- `stack/*.ts` — push/pop/expire/refresh primitives.

Files above are structural reservations, not a premature directory layout. Final paths adapt to Postiz's NX monorepo conventions when implementation begins.
