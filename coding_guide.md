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
- [x] 2.12 — Pause/resume: `cadence_config.paused_until` + slot scheduler respect

### Phase 3 — Generation sub-agents
- [x] 3.1 — Copywriter agent (draft generation, voice-aware)
- [x] 3.2 — Fan-out agent (intent → per-platform drafts → stacks)
- [x] 3.3 — Platform rewrite skill (draft → platform-tuned variant)
- [x] 3.4 — Researcher agent (Tavily integration)
- [x] 3.5 — Researcher agent (Apify basic)

### Phase 4 — Learning loop
- [x] 4.1 — Analytics snapshot skill (per platform, reuse Postiz where possible)
- [x] 4.2 — Rollback skill (delete from platform + mark row)
- [x] 4.3 — Prisma: `strategy_patterns` + `tenant_strategy_optout` + migration
- [x] 4.4 — Analyzer agent (performance → tenant memory)
- [x] 4.5 — Analyzer: anonymized strategy pattern extraction
- [x] 4.6 — Opt-out setting surface in chat

### Phase 1 — Chat Core revisit (versatile orchestrator)
> Replaces the rigid intent_parser → branching pipeline (slice 1.3) with a tool-use orchestrator agent. Motivated by failure case: "schedule a post after 5 minutes" loops because intent_parser is stateless and re-classifies follow-up answers as new direct_action requests, and `_parseTiming` cannot resolve relative times reliably. New design: deterministic time parser + orchestrator that sees full state snapshot and calls tools (existing skills) iteratively.
- [x] 1.3.a — `chrono-node` integration + `autopilot/time/parse.ts` (deterministic time parser, formatForUser)
- [x] 1.3.b — Orchestrator tool registry types + extended SSE event types
- [x] 1.3.c — Orchestrator agent skeleton with starter tools (`schedule_post`, `list_scheduled_posts`, `cancel_pending_draft`, `clarify_with_user`); chat.service routes through it; **fixes "after 5 minutes"**
- [x] 1.3.d — Management tools (`cancel_scheduled_post`, `reschedule_post`, `pause_posting`, `resume_posting`, `rollback_published_post`)
- [x] 1.3.e — Insight tools (`analytics_snapshot`, `research_topic`, `scrape_competitor`)
- [x] 1.3.f — Profile/memory tools (`update_business_profile`, `get_profile`, `set_strategy_optout`, `save_memory`, `recall_memory`, `get_older_history`); deprecate `intent_parser` from normal flow
- [x] 1.3.g — Frontend SSE event renderers (scheduled-list bubble, analytics card, reschedule picker, generic confirmation card)

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

### Key files added in Phase 2 — slice 2.12
- **CadenceConfigService**: `autopilot/stack/cadence-config.service.ts`. `@Injectable()`. Constructor: `(private _prisma: PrismaService)`. Methods:
  - `pause(tenantId, platform, until: Date): Promise<ApCadenceConfig>` — upserts config, sets `pausedUntil=until`, `source=USER`, increments `version`.
  - `resume(tenantId, platform): Promise<ApCadenceConfig>` — upserts config, clears `pausedUntil=null`, `source=USER`, increments `version`.
  - `get(tenantId, platform): Promise<ApCadenceConfig | null>` — reads config by compound key.
  - `isPaused(tenantId, platform): Promise<boolean>` — returns true only when `pausedUntil` is non-null and in the future.
- **`applyCadenceConfig` applier**: standalone exported function registered via `registerApplier('cadence_config', ...)` at module load. Whitelisted fields: `pausedUntil` (ISO string or null), `postsPerDay`, `timezone`, `preferredTimes`, `active`. `targetId` = platform name. Sets `source=AI`, increments `version`.
- **Slot scheduler + depth enforcer**: already respecting `pausedUntil` since slices 2.5 and 2.10. No changes needed.

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

### Key files added in Phase 3 — slice 3.1
- **Copywriter agent**: `autopilot/agents/copywriter.ts`. Exports:
  - `runCopywriter(ctx: AgentContext, input: CopywriterInput): Promise<CopywriterOutput>` — loads profile + memory, builds voice-aware system prompt, calls `generateObject` to produce structured drafts.
  - `copywriterAgent: AgentDefinition<CopywriterInput, CopywriterOutput>` — id: `'copywriter'`.
  - `CopywriterInput { platform: string, topic: string, count?: number, guidelines?: string }`.
  - `CopywriterOutput { drafts: CopywriterDraft[] }`.
  - `CopywriterDraft { content: string, hookType?: string, cta?: string, hashtags?: string[], characterCount: number }`.
  - Platform specs: `PLATFORM_SPECS` record keyed by lowercase platform name (`twitter`, `linkedin`, `instagram`, `facebook`, `threads`, `tiktok`, `youtube`). Each has `displayName`, `maxChars`, `conventions`. Unknown platforms get a generic fallback.
  - Voice injection: reads `getStructuredProfile()` for brand voice, niche, goals, anti-patterns, growth rules. Queries `queryVector()` with the topic (top 5, kinds: BRAND_RULE, ANECDOTE, LEARNING, PERSONAL_STORY, MILESTONE). Both gracefully degrade when unavailable.

### Key files added in Phase 3 — slice 3.2
- **Fan-out agent**: `autopilot/agents/fan_out.ts`. Exports:
  - `runFanOut(ctx: AgentContext, input: FanOutInput): Promise<FanOutOutput>` — resolves target platforms, calls `runCopywriter` per platform, pushes drafts to stacks.
  - `fanOutAgent: AgentDefinition<FanOutInput, FanOutOutput>` — id: `'fan_out'`.
  - `FanOutInput { topic: string, platforms?: string[], guidelines?: string, countPerPlatform?: number, priority?: number }`.
  - `FanOutOutput { results: FanOutPlatformResult[], skipped: Array<{ platform: string, reason: string }> }`.
  - `FanOutPlatformResult { platform: string, pushed: number, candidateIds: string[] }`.
  - Default priority: `10` (higher than stock-keeper fills at 0). Source: `'fan_out_agent'`.
  - Platform resolution: when `platforms` omitted, queries `apCadenceConfig.findMany({ active: true, non-paused })` — same pattern as DepthEnforcerService.

### Key files added in Phase 3 — slice 3.3
- **Platform rewrite skill**: `autopilot/skills/rewrite_for_platform.ts`. Exports:
  - `handleRewrite(ctx: SkillContext, input: RewriteInput): Promise<RewriteOutput>` — loads profile for voice, resolves source/target platform specs, calls `generateObject` with Zod schema.
  - `buildRewritePrompt(sourceSpec, targetSpec, profile, guidelines?): string` — pure function for testing.
  - `rewriteForPlatformSkill: SkillEntry<RewriteInput, RewriteOutput>` — id: `'rewrite_for_platform'`. Registered in `SKILL_REGISTRY`.
  - `RewriteInput { draft: string, sourcePlatform?: string, targetPlatform: string, guidelines?: string }`.
  - `RewriteOutput { content, hookType?, cta?, hashtags?, characterCount, originalDraft, platform }`.
- **Copywriter exports added**: `PLATFORM_SPECS`, `DEFAULT_PLATFORM_SPEC`, `PlatformSpec` now exported from `autopilot/agents/copywriter.ts` (were private before 3.3).

- **Orchestrator types (slice 1.3.b)**: `autopilot/orchestrator/types.ts` (re-exported from `autopilot/orchestrator/index.ts`). Type-only contract — no runtime behaviour yet. Exports:
  - `OrchestratorContext { org, user, db: PrismaService, llm: LlmProvider, emit: (event: ChatStreamEvent) => void, now: Date, timezone: string, logger: OrchestratorLogger }` — runtime context passed to every tool handler.
  - `OrchestratorTool<Input, Output> { name: string; description: string; parameters: z.ZodType<Input>; handler: (ctx, input) => Promise<OrchestratorToolResult<Output>> }` — the shape every tool file default-exports. `parameters` is consumed by Vercel AI SDK `tool()` for arg validation.
  - `OrchestratorToolResult<Output> { observation: string; data?: Output; emitted?: boolean }` — `observation` is what the LLM sees on the next reasoning step; `emitted=true` flags that the tool already pushed a UI side-event so the orchestrator can suppress its own text echo.
  - `ORCHESTRATOR_TOOLS: OrchestratorTool<unknown, unknown>[]` — placeholder registry, empty in 1.3.b; populated by 1.3.c.
  - New `ChatStreamEvent` members (also union'd into `chat.service.ts`): `ChatScheduledListEvent` ({ type:'scheduled_list', posts:[...] }), `ChatAnalyticsCardEvent` ({ type:'analytics_card', platform, periodDays, metrics:[...], capturedAt }), `ChatConfirmEvent` ({ type:'confirm', confirmId, action, description, confirmLabel?, cancelLabel? }), `ChatActionResultEvent` ({ type:'action_result', action, ok, message }).
- **Orchestrator agent (slice 1.3.c)**: `autopilot/agents/orchestrator.ts`. Exports:
  - `runOrchestrator(deps: OrchestratorRunDependencies, input: OrchestratorRunInput): Promise<OrchestratorRunOutput>` — one-turn ReAct loop. Builds state snapshot → composes system prompt → `generateText({ model, system, messages, tools, stopWhen: stepCountIs(5) })` → post-hoc decides whether to emit final text (only if no tool marked `emitted=true`).
  - `OrchestratorRunInput { message: string; history: Array<{role:'user'|'assistant', content:string}>; tenantCtx? }`.
  - `OrchestratorRunOutput { text: string; toolCallCount: number; toolsUsed: string[] }`.
  - `OrchestratorRunDependencies extends OrchestratorToolDeps { org, user, db: PrismaService, llm: LlmProvider, emit, now?, timezone?, logger: OrchestratorLogger }`.
  - `ORCHESTRATOR_MAX_STEPS = 5`. `buildSystemPrompt(stateBlock)` — role + style + `<state>…</state>` fence (6 numbered RULES: pending-flow merge semantics, no `schedule_post`+`clarify_with_user` same turn, cancel-before-fresh, queue queries → `list_scheduled_posts`, stop after `draft_preview`, time expressions passed verbatim as `when`).
  - `adaptToolsForAiSdk(ctx, registry, trace)` — converts `OrchestratorTool<I,O>[]` to `Record<string, Tool>` via `tool<unknown, string>({…})`; mutable `trace` captures `{name, result}` per call for post-run inspection + emission-suppression.
- **State snapshot (slice 1.3.c)**: `autopilot/orchestrator/state-snapshot.ts`. Exports:
  - `buildStateSnapshot(db, { organizationId, now, timezone, tenantCtx }): Promise<StateSnapshotData>` — parallel prisma queries for integrations, active cadence configs, live pending action (expiry-checked), upcoming PENDING slots (7-day window).
  - `formatStateSnapshot(snapshot): string` — compact text block with `now` (ISO), `timezone`, connected platforms, niche/goals, pending action summary (with `describeCollected` — platforms, topic/content, timing, image flag; `truncate` caps topic at 60 chars), cadences, upcoming scheduled posts.
  - Types: `StateSnapshotInput`, `StateSnapshotData`, `PendingActionSnapshot`, `CadenceSnapshot`, `UpcomingSlotSnapshot`.
- **Orchestrator starter tools (slice 1.3.c)**: `autopilot/orchestrator/tools/*.ts` + `tools/index.ts` (barrel). Each tool is a factory `createXxxTool(deps): OrchestratorTool<I,O>` for explicit DI. `buildOrchestratorTools({ directAction })` returns the 4-tool registry.
  - `schedule_post` — bug-fix carrier. Args: `{ topic?, content?, platforms?, when?, immediate?, wantsImage?, countPerPlatform? }`. Resolves `when` via `parseTimeExpression({ now, timezone, forwardOnly: true })` — **past/unparseable → leaves timing UNSET** (does NOT default to `immediate=true`; that was the original bug). Merges tool input with prior pending `collectedData` (explicit `immediate=true` clears `scheduleAt`; fresh `scheduleAt` clears `publishImmediately`). Delegates to `DirectActionHandler.startFlow`. Wraps `ctx.emit` to detect whether `draft_preview` or follow-up `text` was emitted → returns `stage: 'preview_emitted' | 'follow_up_question' | 'noop'` with `emitted: true`.
  - `list_scheduled_posts` — args: `{ platform?, daysAhead?, limit? }` (daysAhead 1–60, default 14; limit 1–50, default 20). Queries `apScheduledSlot.findMany` including `postCandidate.content`. Emits `scheduled_list` side-event + observation summary using `formatForUser`.
  - `cancel_pending_draft` — cancels the active in-progress draft via `DirectActionHandler.cancelAction`. Description explicitly scopes OUT already-scheduled posts (that belongs to slice 1.3.d `cancel_scheduled_post`).
  - `clarify_with_user` — emits the question as a `text` chunk and returns `emitted: true` with observation `asked the user: "...". Stop and wait for their reply.` Orchestrator sees this and the LLM's turn effectively ends.
- **Chat-service routing (slice 1.3.c)**: `chat/chat.service.ts` non-onboarding path now branches as: (1) `intent=direct_action` OR any live (non-expired) pending action → `runOrchestrator(...)`; (2) `intent=config_change_request` (no pending) → existing `createProposal` pipeline; (3) else → existing `streamText` reply. `parseIntent` still gates 2 + 3 — full removal lands in 1.3.f. NestJS `Logger` is adapted inline (`info → log`) because `OrchestratorLogger` expects `info`. Timezone is derived from the first active `ApCadenceConfig` row (falls back to `'UTC'`) — resolved in slice 1.3.e.
- **Management tools (slice 1.3.d)**: `autopilot/orchestrator/tools/{cancel_scheduled_post,reschedule_post,pause_posting,resume_posting,rollback_published_post}.ts`. All follow the same factory+spec pattern as 1.3.c tools. Each emits `action_result` (ok/message) as its UI side-event. Key behaviours:
  - `cancel_scheduled_post` — takes `slotId`. Only cancels PENDING slots; TRIGGERED/CANCELLED/SKIPPED return a no-op observation. Updates `apScheduledSlot.status = CANCELLED` with audit metadata. Emits `action_result`.
  - `reschedule_post` — takes `slotId` + `when`. Parses time via `parseTimeExpression` (forwardOnly). Guards: past time, unparseable time, non-PENDING slot, collision with another PENDING slot at exact-same instant.
  - `pause_posting` — takes `platform?` + (`durationDays?` | `until?`). Defaults to 7 days. When platform omitted, queries active `apCadenceConfig` rows and pauses each. Delegates to `CadenceConfigService.pause`.
  - `resume_posting` — takes `platform?`. When omitted, queries configs with `pausedUntil > now` and resumes each. Delegates to `CadenceConfigService.resume`.
  - `rollback_published_post` — takes `publishedPostId` + `reason?`. Wraps `handleRollback` from `skills/rollback_post.ts` via an inline `OrchestratorContext → SkillContext` adapter (`.org → .tenant`). Always sets `platformDeleted=false` and states platform content must be manually removed.
  - `OrchestratorToolDeps` now also requires `cadenceConfig: CadenceConfigService`. Threaded from `chat.service.ts` (which now injects `CadenceConfigService`) through `runOrchestrator` → `buildOrchestratorTools`.
- **Insight tools (slice 1.3.e)**: `autopilot/orchestrator/tools/{analytics_snapshot,research_topic,scrape_competitor}.ts`. All follow the same factory+spec pattern. No new `OrchestratorToolDeps` entries needed (no service injection required — skill/agent functions are called directly).
  - `analytics_snapshot` — takes `platform`, optional `integrationId` + `periodDays`. Bridges `OrchestratorContext → SkillContext` (`.org → .tenant`) and delegates to `handleAnalyticsSnapshot`. Maps `AnalyticsData[]` to `metrics[]` (sum all daily totals per metric, trend from `percentageChange`). Emits `analytics_card` only when `supported && data.length > 0`; observation always populated for LLM.
  - `research_topic` — takes `query`, optional `depth` + `maxResults`. Bridges to `AgentContext` (= `SkillContext`) and calls `runResearcher` with `type: 'web_search'`. Returns the researcher's LLM-generated summary as `observation`. Catches errors (missing API key, network failures) with a graceful message pointing to `AP_TAVILY_API_KEY`.
  - `scrape_competitor` — takes `handle`, optional `platforms` + `maxResults`. Calls `runResearcher` with `type: 'competitor_scrape'`. Defaults `platforms` to `['twitter']`. Same error-handling pattern. Points to `AP_APIFY_API_KEY` on failure.
  - Both research tools do NOT emit UI side-events (no dedicated card type defined); observation is the LLM summary.
  - `agents/orchestrator.spec.ts` adds a mock for `skills/analytics_snapshot` to break the `socialIntegrationList → social.abstract.ts → concurrency.service.ts` import chain that would otherwise fail ts-jest under `noImplicitReturns`.
- **Profile/memory tools (slice 1.3.f)**: `autopilot/orchestrator/tools/{update_business_profile,set_strategy_optout,save_memory,recall_memory,get_older_history,get_profile}.ts` (6 tools). Key behaviours:
  - `update_business_profile` — takes `changes` (record) + `rationale`. Calls `createProposal(db, org.id, { targetEntity: 'business_profile', ... })`, emits `proposal` SSE event, returns `emitted: true`. Never writes directly.
  - `set_strategy_optout` — takes `optedOut: boolean` + optional `reason`. Same pattern: creates `tenant_strategy_optout` proposal, emits `proposal` event, `emitted: true`.
  - `save_memory` — takes `content`, `kind` (default `LEARNING`), optional `freshnessTtlDays`. Calls `writeVector(db, org.id, ...)`. Graceful error observation if `AP_OPENAI_API_KEY` absent. Kind fallback `?? 'LEARNING'` applied in handler (Zod `.default()` only fires during schema parse, not direct handler calls).
  - `recall_memory` — takes `query`, optional `kinds[]` filter, optional `topK` (1–10 default 5). Calls `queryVector(db, org.id, query, topK, kinds)`. Formats results as numbered observation with kind + similarity score. Graceful error if key absent.
  - `get_older_history` — takes `skipRecent` (default 20, matching context window) + `limit` (1–50 default 20). Queries `apChatMessage` with `orderBy: createdAt DESC`, `skip`, `take`, then reverses for chronological output.
  - `get_profile` (already existed, now registered) — zero-arg; calls `getStructuredProfile(db, org.id)`; formats profile fields as observation.
  - **chat.service.ts refactored**: removed `parseIntent` import and all intent-based branching (`hasPending`, `useOrchestrator`, `config_change_request` branch, `streamText` fallback). Normal flow now calls `runOrchestrator` directly for all non-onboarding turns. `createProposal` and `streamText` imports retained for the onboarding path. Removed dead `_isCancellationMessage` and `_buildReplyPrompt` helpers.
- **Frontend SSE event renderers (slice 1.3.g)**: `apps/frontend/src/components/autopilot/chat-layout.tsx` extended with:
  - New message types: `ScheduledListMsg` (role `'scheduled_list'`, `posts[]` with id/platform/content/scheduledAt/status), `ActionResultMsg` (role `'action_result'`, action/ok/message), `ConfirmMsg` (role `'confirm'`, confirmId/action/description/confirmLabel/cancelLabel/decided/resultMessage?).
  - SSE switch cases: `scheduled_list` → pushes `ScheduledListMsg`, replacing the placeholder assistant stub (same empty-stub-filter pattern as `proposal`/`draft_preview`); `action_result` → replaces stub with `ActionResultMsg`; `confirm` → replaces stub with `ConfirmMsg`.
  - `done` handler: when `specialEmitted=true`, filters the empty assistant stub before adding the `done` marker.
  - `ScheduledListBubble`: table of upcoming posts per platform with truncated content, `formatScheduledAt` timestamp. Each row has Cancel button (auto-sends `Cancel slot ${slotId}` message via `handleSend`) and Reschedule button (prefills textarea with `Reschedule slot ${slotId} to ` via `setInput` + focus). `actedSlots: Set<string>` prevents double-clicks.
  - `ActionResultBubble`: green `CheckIcon` (ok=true) or red `XIcon` (ok=false) + message text inline.
  - `ConfirmBubble`: confirm/cancel buttons with custom labels from the event. On click, calls `PATCH /autopilot/chat/confirm/${confirmId}/${decision}` (decision: `'confirmed'|'cancelled'`). Updates local state with `resultMessage`; buttons disabled after decision.
  - New callbacks threaded through `MessageRow`: `onConfirmDecision(confirmId, decision)`, `onSendMessage(text)` (Cancel action), `onPrefillInput(text)` (Reschedule prefill).
  - Helpers: `truncateText(s, n)` — ellipsis at n chars; `formatScheduledAt(iso)` — locale-formatted weekday+month+day+time.
- **Time parser (slice 1.3.a)**: `autopilot/time/parse.ts`. Exports:
  - `parseTimeExpression(input: string, options?: { now?: Date; timezone?: string; forwardOnly?: boolean }): ParsedTime | null` — deterministic chrono-node + ISO 8601 short-circuit. ISO inputs go straight through `new Date()`. Natural language is parsed against a tz-aware ref Date (server-local Date built from user's wall-clock at `now` in `timezone`), then `start.get('year'..'second')` components are converted to real UTC via `wallClockToUtc` from `stack/slot-scheduler.service.ts` (+ seconds added on top). `forwardOnly` (default true) makes bare past times like "3pm" roll to tomorrow.
  - `formatForUser(date: Date, options?: { now?: Date; timezone?: string }): string` — humanises ("in 5 minutes", "tomorrow at 9:00 AM", "Friday at 3:00 PM", "Apr 30 at 7:00 PM", "30 seconds ago", "yesterday at …").
  - `ParsedTime { date: Date; isRelative: boolean; isPast: boolean; sourcePhrase: string; confidence: 'high' | 'medium' | 'low' }`.
  - **Use this** in any tool/agent that takes a `when` argument before falling back to LLM disambiguation.
- **SKILL_REGISTRY**: first entry registered — `rewrite_for_platform` in `autopilot/skills/index.ts`.

### Key files added in Phase 4 — slice 4.6
- **`tenant_strategy_optout` applier**: registered in `proposals.ts` at module load alongside `business_profile` and `growth_rule`. `changes.optedOut=true` → `apTenantStrategyOptout.upsert` (create if absent, no-op if present); `changes.optedOut=false` → `apTenantStrategyOptout.deleteMany` (idempotent). `changes.reason` stored when provided.
- **Intent parser updated**: `tenant_strategy_optout` added to `ENTITIES` in the system prompt. LLM generates `targetId=null, changes:{optedOut:boolean}` for opt-in/out requests.
- **Chat service updated**: `handleChat` now loads `apTenantStrategyOptout` alongside the business profile. `tenantCtx.strategyOptout` included in `_buildReplyPrompt` so the LLM can answer status queries. New method: `getStrategyOptoutStatus(tenantId): Promise<{optedOut:boolean}>`.
- **Status endpoint**: `GET /autopilot/chat/settings/strategy-optout` — returns `{ optedOut: boolean }`. Authenticated, registered in `authenticatedController` array.
- **Frontend**: `STARTER_PROMPTS` includes "Manage data sharing settings". `describeChanges()` helper in `chat-layout.tsx` renders privacy-aware text in `ProposalBubble` when `targetEntity === 'tenant_strategy_optout'`.

### Key files added in Phase 4 — slices 4.3–4.5
- **ApStrategyPattern model**: `schema.prisma` (`@@map("ap_strategy_pattern")`). Key fields: `platform`, `niche?`, `patternType` (enum `ApStrategyPatternType`: `POSTING_FREQUENCY | CONTENT_FORMAT | ENGAGEMENT_HOOK | HASHTAG_STRATEGY | TIMING | TONE`), `patternKey` (stable snake_case identifier for dedup), `title`, `description`, `evidenceCount` (Int default 1 — incremented on upsert), `performanceData` (Json), `active`. `@@unique([platform, patternKey])` for upsert dedup. No Organization FK — intentionally cross-tenant.
- **ApTenantStrategyOptout model**: `schema.prisma` (`@@map("ap_tenant_strategy_optout")`). `organizationId @unique` (one-per-tenant opt-out), FK → Organization. When a row exists for a tenant, the Analyzer skips pattern extraction for them.
- **Analyzer agent**: `autopilot/agents/analyzer.ts`. Exports:
  - `runAnalyzer(ctx: AgentContext, input: AnalyzerInput): Promise<AnalyzerOutput>` — loads recent `ApPublishedPost` rows + candidate content, loads business profile + growth rules, calls `generateObject` for insights + patterns, writes `LEARNING` memories via `writeVector`, upserts patterns via `apStrategyPattern.upsert` after opt-out check.
  - `analyzerAgent: AgentDefinition<AnalyzerInput, AnalyzerOutput>` — id: `'analyzer'`, allowedSkills: `['analytics_snapshot']`.
  - `AnalyzerInput { platform: string, periodDays?: number, analyticsData?: { data: AnalyticsData[], capturedAt: string, supported: boolean, note?: string } }`.
  - `AnalyzerOutput { platform, periodDays, postsAnalyzed, insights: PerformanceInsight[], stored, patternsExtracted, optedOut }`.
  - `PerformanceInsight { type: 'strength'|'weakness'|'opportunity'|'learning', title, description, confidence: 'high'|'medium'|'low' }`.
  - Slice 4.5 embedded: opt-out check via `apTenantStrategyOptout.findUnique({ organizationId })`; upsert via `apStrategyPattern.upsert({ where: { platform_patternKey }, create: {..., evidenceCount: 1}, update: { evidenceCount: { increment: 1 } } })`.
  - Pattern extraction skipped when tenant opted out or LLM returns empty patterns array.

### Key files added in Phase 4 — slices 4.1–4.2
- **Analytics snapshot skill**: `autopilot/skills/analytics_snapshot.ts`. Exports:
  - `handleAnalyticsSnapshot(ctx: SkillContext, input: AnalyticsSnapshotInput): Promise<AnalyticsSnapshotOutput>` — resolves an `Integration` row from DB (scoped to tenant, `disabled=false, deletedAt=null`), finds the provider in `socialIntegrationList`, calls `provider.analytics(internalId, token, periodDays)`. Returns `supported=false` when no integration found or provider lacks `analytics()`. Returns `supported=true, data=[]` with a note on provider errors (no throws). No LLM call.
  - `AnalyticsSnapshotInput { platform: string, integrationId?: string, periodDays?: number }`.
  - `AnalyticsSnapshotOutput { platform, integrationId, integrationName, data: AnalyticsData[], capturedAt: string, periodDays, supported: boolean, note?: string }`.
  - `analyticsSnapshotSkill: SkillEntry` — id: `'analytics_snapshot'`, cost: 1.
  - **No token refresh** — expired tokens return empty data with a warning log. Token refresh stays in `IntegrationService`.
- **Rollback post skill**: `autopilot/skills/rollback_post.ts`. Exports:
  - `handleRollback(ctx: SkillContext, input: RollbackPostInput): Promise<RollbackPostOutput>` — looks up `ApPublishedPost` by `(id, organizationId=tenant.id)`. Runs a single `$transaction`: (1) `post.updateMany({ where: { id: postizPostId, deletedAt: null }, data: { deletedAt: now } })` — soft-delete; (2) `apPostCandidate.update({ status: FAILED, metadata: merge+rollbackMeta })`; (3) `apPublishedPost.update({ metadata: merge+rollbackMeta })`. Idempotent: if `metadata.rolledBack===true` returns immediately without re-running.
  - `RollbackPostInput { publishedPostId: string, reason?: string }`.
  - `RollbackPostOutput { publishedPostId, postizPostId, platform, rolledBack: boolean, platformDeleted: false, note: string }` — `platformDeleted` is always `false` (no provider-level delete API in Postiz).
  - `rollbackPostSkill: SkillEntry` — id: `'rollback_post'`, cost: 2.

### Key files added in Phase 3 — slices 3.4–3.5
- **Researcher agent**: `autopilot/agents/researcher.ts`. Exports:
  - `searchTavily(query, depth?, maxResults?): Promise<ResearchFinding[]>` — calls Tavily search API via native `fetch`. Requires `AP_TAVILY_API_KEY`.
  - `runApifyActor(actorId, input, maxItems?): Promise<Record<string, unknown>[]>` — generic Apify actor runner: start run → poll (3s interval, 120s timeout) → fetch dataset items. Requires `AP_APIFY_API_KEY`.
  - `scrapeCompetitor(handle, platforms, maxItems?): Promise<ResearchFinding[]>` — builds profile URLs from `COMPETITOR_URL_TEMPLATES` map (twitter, linkedin, instagram, facebook, tiktok, youtube, threads), runs web content crawler actor (overridable via `AP_APIFY_SCRAPER_ACTOR` env var), returns findings with content truncated to 2000 chars.
  - `runResearcher(ctx: AgentContext, input: ResearcherInput): Promise<ResearcherOutput>` — routes to `searchTavily` or `scrapeCompetitor` based on `input.type`, generates LLM summary via `generateObject`.
  - `researcherAgent: AgentDefinition<ResearcherInput, ResearcherOutput>` — id: `'researcher'`.
  - `ResearcherInput { query, type?: 'web_search' | 'competitor_scrape', depth?, maxResults?, handle?, platforms? }`.
  - `ResearchFinding { title, url, content, relevance, source: 'tavily' | 'apify' }`.
  - `ResearcherOutput { findings, summary, query, type }`.
- **Skill costs registered**: `rewrite_for_platform: 3`, `research_topic: 2`, `research_competitor: 5` in `autopilot/skill-costs.ts`.

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

### Phase 3 — Generation sub-agents

#### Slice 3.1 — Copywriter agent (draft generation, voice-aware)

- **Goal:** Define the `copywriterAgent` (`AgentDefinition`) that generates social media post drafts for a given platform, infused with the tenant's brand voice from `ApBusinessProfile` and relevant context from vector memory.
- **Depends on:** 0.6 (AgentDefinition types), 1.1 (ApBusinessProfile for brand voice), 1.6 (Memory service for vector recall), 0.16 (LLM wiring for generation).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/agents/copywriter.ts` — new agent file
  - `libraries/nestjs-libraries/src/autopilot/agents/copywriter.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/agents/index.ts` — re-export
- **Exported API:**
  - `runCopywriter(ctx: AgentContext, input: CopywriterInput): Promise<CopywriterOutput>` — loads profile + memory, builds voice-aware system prompt, calls `generateObject` to produce structured draft(s).
  - `copywriterAgent: AgentDefinition<CopywriterInput, CopywriterOutput>` — registry entry.
  - `CopywriterInput { platform, topic, count?, guidelines? }` — what to write about, how many drafts, optional extra constraints.
  - `CopywriterOutput { drafts: CopywriterDraft[] }` — array of generated drafts.
  - `CopywriterDraft { content, hookType?, cta?, hashtags?, characterCount }` — a single draft with optional structural metadata.
- **Design notes:**
  - Loads `getStructuredProfile()` to extract brand voice (short + extended), niche, goals, anti-patterns.
  - Queries `queryVector()` with the topic to find relevant anecdotes, brand rules, and learnings (top 5).
  - Builds a system prompt that encodes platform constraints (character limits, conventions), brand voice, and memory context.
  - Uses `generateObject` from `ai-v5` with a Zod schema for structured output.
  - Handles missing profile gracefully (generic voice; still generates).
  - `count` defaults to 1; each draft is independently generated within one LLM call.
- **Definition of done:** unit tests cover: generating a draft with mocked LLM; voice context from business profile injected into system prompt; memory queried for relevant context; multiple drafts when `count > 1`; handles missing profile gracefully; `copywriterAgent` shape smoke test passes; typecheck passes.
- **Out of scope:** pushing to stack (fan-out agent, slice 3.2), strategy patterns (Phase 4), platform-specific rewriting (slice 3.3), actual LLM integration tests.

#### Slice 3.2 — Fan-out agent (intent → per-platform drafts → stacks)
- **Goal:** Create the fan-out orchestrator that turns a topic into per-platform drafts (via Copywriter) and pushes them to the post-candidate stacks.
- **Depends on:** 3.1 (Copywriter agent), 2.2 (stack push), 2.3 (cadence config for platform resolution).
- **Files touched:**
  - `autopilot/agents/fan_out.ts` (new) — `runFanOut`, `fanOutAgent`, `FanOutInput`, `FanOutOutput`, `FanOutPlatformResult`.
  - `autopilot/agents/fan_out.spec.ts` (new) — 14 tests.
  - `autopilot/agents/index.ts` — added `fan_out` export.
- **Types:**
  - `FanOutInput { topic, platforms?, guidelines?, countPerPlatform?, priority? }` — what to fan out, optional platform narrowing, optional extra constraints.
  - `FanOutOutput { results: FanOutPlatformResult[], skipped: { platform, reason }[] }` — per-platform push results + skip reasons.
  - `FanOutPlatformResult { platform, pushed, candidateIds }` — summary for one platform.
- **Design notes:**
  - When `platforms` is omitted, resolves target platforms from active non-paused `ap_cadence_config` rows for the tenant (same query pattern as DepthEnforcerService/SlotSchedulerService).
  - Calls `runCopywriter()` per platform sequentially (avoids overwhelming LLM with concurrent requests).
  - Pushes each draft via `push()` with `priority=10` (above stock-keeper fills), `source='fan_out_agent'`, and metadata containing topic/hookType/cta/hashtags.
  - Per-platform error isolation: a failure on one platform skips it and continues with the rest.
  - `countPerPlatform` clamped to [1, 5]; defaults to 1.
- **Definition of done:** unit tests cover: explicit platform fan-out; auto-resolve from cadence config; multiple drafts per platform; priority/metadata passthrough; error isolation (one platform fails, others continue); empty platform list; AgentDefinition shape; typecheck passes.
- **Out of scope:** wiring into chat service `direct_action` intent (separate integration slice), strategy patterns (Phase 4), platform-specific rewriting (slice 3.3), cron-based refill triggers.

#### Slice 3.3 — Platform rewrite skill (draft → platform-tuned variant)

- **Goal:** A registered skill that takes an existing draft (written for one platform) and rewrites it for a different target platform, adapting tone, length, conventions, and hashtag strategy while preserving the core message and brand voice.
- **Depends on:** 3.1 (PLATFORM_SPECS from copywriter), 1.6 (getStructuredProfile for voice), 0.16 (LLM wiring), 0.3 (SkillEntry types).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/agents/copywriter.ts` — export `PLATFORM_SPECS`, `DEFAULT_PLATFORM_SPEC`, `PlatformSpec` (were private)
  - `libraries/nestjs-libraries/src/autopilot/skills/rewrite_for_platform.ts` — new skill file
  - `libraries/nestjs-libraries/src/autopilot/skills/rewrite_for_platform.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/skills/index.ts` — register in SKILL_REGISTRY
  - `libraries/nestjs-libraries/src/autopilot/skill-costs.ts` — add `rewrite_for_platform: 3`
- **Exported API from rewrite_for_platform.ts:**
  - `RewriteInput { draft, sourcePlatform?, targetPlatform, guidelines? }`
  - `RewriteOutput { content, hookType?, cta?, hashtags?, characterCount, originalDraft, platform }`
  - `handleRewrite(ctx: SkillContext, input: RewriteInput): Promise<RewriteOutput>` — loads profile for voice, resolves platform specs, calls `generateObject` with Zod schema.
  - `buildRewritePrompt(sourceSpec, targetSpec, profile, guidelines?)` — pure function, exported for testing.
  - `rewriteForPlatformSkill: SkillEntry<RewriteInput, RewriteOutput>` — id: `'rewrite_for_platform'`.
- **Definition of done:** skill registered in `SKILL_REGISTRY`; handles source/target platform specs; injects brand voice; graceful fallback when profile missing; handles unknown platforms with generic spec; unit tests pass; typecheck passes.
- **Out of scope:** integration with fan-out agent (future slice), cron-based rewriting, UI surface.

#### Slice 3.4 — Researcher agent (Tavily integration)

- **Goal:** Create the researcher agent with web search capability via the Tavily API. Returns structured findings and an LLM-generated summary contextualized to the tenant's niche.
- **Depends on:** 0.6 (AgentDefinition types), 1.6 (getStructuredProfile for niche context), 0.16 (LLM wiring for summary generation), 0.1 (AP_TAVILY_API_KEY env var).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/agents/researcher.ts` — new agent file
  - `libraries/nestjs-libraries/src/autopilot/agents/researcher.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/agents/index.ts` — re-export
  - `libraries/nestjs-libraries/src/autopilot/skill-costs.ts` — add `research_topic: 2`
- **Exported API from researcher.ts:**
  - `ResearcherInput { query, type?: 'web_search' | 'competitor_scrape', depth?, maxResults?, handle?, platforms? }`
  - `ResearchFinding { title, url, content, relevance, source: 'tavily' | 'apify' }`
  - `ResearcherOutput { findings, summary, query, type }`
  - `searchTavily(query, depth?, maxResults?): Promise<ResearchFinding[]>` — direct Tavily API call via `fetch`.
  - `runResearcher(ctx, input): Promise<ResearcherOutput>` — main entry: calls searchTavily, then generates LLM summary.
  - `researcherAgent: AgentDefinition<ResearcherInput, ResearcherOutput>` — id: `'researcher'`.
- **Tavily integration details:** POST `https://api.tavily.com/search` with `{ api_key, query, search_depth, max_results }`. Uses native `fetch()`. Requires `AP_TAVILY_API_KEY`.
- **Definition of done:** searchTavily returns structured findings; runResearcher generates niche-aware summary; graceful fallback when profile missing; generic summary when LLM fails; early return for empty findings; unit tests pass; typecheck passes.
- **Out of scope:** writing findings to memory (memorist integration), cron-based research, UI surface.

#### Slice 3.5 — Researcher agent (Apify basic)

- **Goal:** Extend the researcher agent with structured scraping via Apify for competitor analysis. Adds a generic Apify actor runner and a competitor scrape function that builds profile URLs and crawls them.
- **Depends on:** 3.4 (researcher agent base), 0.1 (AP_APIFY_API_KEY env var).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/agents/researcher.ts` — add Apify functions
  - `libraries/nestjs-libraries/src/autopilot/agents/researcher.spec.ts` — add Apify tests
  - `libraries/nestjs-libraries/src/autopilot/skill-costs.ts` — add `research_competitor: 5`
- **Exported API added to researcher.ts:**
  - `runApifyActor(actorId, input, maxItems?): Promise<Record<string, unknown>[]>` — generic Apify actor runner: start run → poll for completion → fetch dataset items. Timeout: 120s. Poll interval: 3s.
  - `scrapeCompetitor(handle, platforms, maxItems?): Promise<ResearchFinding[]>` — builds profile URLs from `COMPETITOR_URL_TEMPLATES` (twitter, linkedin, instagram, facebook, tiktok, youtube, threads), runs `apify/website-content-crawler` actor (overridable via `AP_APIFY_SCRAPER_ACTOR`), returns findings. Content truncated to 2000 chars.
- **Apify integration details:** Start run: POST `https://api.apify.com/v2/acts/{actorId}/runs?token={key}`. Poll: GET `.../actor-runs/{runId}?token={key}`. Dataset: GET `.../datasets/{datasetId}/items?token={key}&limit={n}`.
- **Definition of done:** runApifyActor handles start → poll → fetch lifecycle; scrapeCompetitor builds correct URLs for all supported platforms; handles unknown platforms (empty result); content truncated; custom actor override via env var; runResearcher routes to scrapeCompetitor when `type='competitor_scrape'`; throws when handle missing; defaults to twitter; unit tests pass; typecheck passes.
- **Out of scope:** deep research (Pro tier), actor-specific input schemas, result caching, rate limiting.

### Phase 4 — Learning loop

#### Slice 4.1 — Analytics snapshot skill (per platform, reuse Postiz where possible)

- **Goal:** A registered skill that fetches per-platform analytics for a tenant by delegating to the existing Postiz integration provider `analytics()` methods. Returns structured engagement data (impressions, likes, comments, shares, etc.) for a configurable look-back window.
- **Depends on:** 0.3 (SkillEntry types), 0.16 (LLM wiring not needed here, but `SkillContext` is required), 2.6 (ApPublishedPost exists so there are meaningful published posts to query analytics for).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/skills/analytics_snapshot.ts` — new skill file
  - `libraries/nestjs-libraries/src/autopilot/skills/analytics_snapshot.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/skills/index.ts` — register in SKILL_REGISTRY
  - `libraries/nestjs-libraries/src/autopilot/skill-costs.ts` — add `analytics_snapshot: 1`
- **Exported API from analytics_snapshot.ts:**
  - `AnalyticsSnapshotInput { platform: string, integrationId?: string, periodDays?: number }` — platform = Postiz providerIdentifier (e.g. `'twitter'`, `'linkedin'`); integrationId = Postiz Integration.id for disambiguation when a tenant has multiple accounts per platform; periodDays defaults to 30.
  - `AnalyticsSnapshotOutput { platform, integrationId, integrationName, data: AnalyticsData[], capturedAt: string, periodDays: number, supported: boolean }` — `data` is the raw `AnalyticsData[]` from the Postiz interface; `supported=false` when the provider has no `analytics()` method.
  - `handleAnalyticsSnapshot(ctx: SkillContext, input: AnalyticsSnapshotInput): Promise<AnalyticsSnapshotOutput>` — looks up the Integration row from DB using `ctx.db`, finds the provider via `socialIntegrationList`, calls `provider.analytics(internalId, token, periodDays)`. Gracefully returns empty data on any error.
  - `analyticsSnapshotSkill: SkillEntry<AnalyticsSnapshotInput, AnalyticsSnapshotOutput>` — id: `'analytics_snapshot'`.
- **Integration resolution:** Query `db.integration.findFirst({ where: { organizationId: tenant.id, providerIdentifier: platform, disabled: false, deletedAt: null } })`. If `integrationId` is provided, add `id: integrationId` to the where clause. If no integration found, return `{ supported: false, data: [] }`.
- **No token refresh:** The skill does not refresh tokens — if the token is expired it returns the stale data or empty data. Token refresh remains the responsibility of IntegrationService (only called through the full auth flow). Log a warning on auth errors.
- **No LLM call:** This skill is purely a data fetch. Credit cost is 1 (minimal compute).
- **AnalyticsData type:** imported from `@gitroom/nestjs-libraries/integrations/social/social.integrations.interface` (already used in `integration.service.ts`).
- **Definition of done:** skill registered in SKILL_REGISTRY; unit tests cover: integration found + analytics returned; integration not found → supported=false; provider has no analytics method → supported=false; analytics call throws → returns empty with error note; typecheck passes.
- **Out of scope:** token refresh (IntegrationService's responsibility), caching (IntegrationService handles that via Redis), writing analytics into memory (Analyzer agent, slice 4.4), LLM summarization (Analyzer agent, slice 4.4), multi-platform batch (call the skill once per platform), UI surface.

#### Slice 4.2 — Rollback skill (delete from platform + mark row)

- **Goal:** A registered skill that marks an autopilot-published post as rolled back in the autopilot DB layer: soft-deletes the linked Postiz `Post` row and annotates the `ApPublishedPost` and `ApPostCandidate` records. "Delete from platform" at the DB level means removing the Postiz Post from the scheduler — actual retraction of live platform content is not supported by Postiz's integration abstraction (no provider-level delete API exists).
- **Depends on:** 2.6 (`ApPublishedPost` + `ApPostCandidate` + `ApScheduledSlot` schema), 2.7 (published_posts table), 0.3 (SkillEntry types).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/skills/rollback_post.ts` — new skill file
  - `libraries/nestjs-libraries/src/autopilot/skills/rollback_post.spec.ts` — unit tests
  - `libraries/nestjs-libraries/src/autopilot/skills/index.ts` — register in SKILL_REGISTRY
  - `libraries/nestjs-libraries/src/autopilot/skill-costs.ts` — add `rollback_post: 2`
- **Exported API from rollback_post.ts:**
  - `RollbackPostInput { publishedPostId: string, reason?: string }` — `publishedPostId` = `ApPublishedPost.id`. `reason` is stored in metadata for auditability.
  - `RollbackPostOutput { publishedPostId: string, postizPostId: string, platform: string, rolledBack: boolean, platformDeleted: boolean, note: string }` — `platformDeleted` is always `false` with a note explaining that live platform content must be manually retracted.
  - `handleRollback(ctx: SkillContext, input: RollbackPostInput): Promise<RollbackPostOutput>` — all three DB mutations run in a single `$transaction`.
  - `rollbackPostSkill: SkillEntry<RollbackPostInput, RollbackPostOutput>` — id: `'rollback_post'`.
- **Rollback steps (inside one `$transaction`):**
  1. Load `ApPublishedPost` by `id=publishedPostId, organizationId=tenant.id` — if not found throw `Error('not_found')`.
  2. Soft-delete the Postiz `Post` row: `db.post.updateMany({ where: { id: postizPostId, deletedAt: null }, data: { deletedAt: new Date() } })`. Idempotent — if already deleted that's fine.
  3. Mark `ApPostCandidate` status = `FAILED`: `db.apPostCandidate.update({ where: { id: publishedPost.postCandidateId }, data: { status: 'FAILED', metadata: { ...existingMeta, rolledBack: true, rollbackReason: reason, rollbackAt: now } } })`.
  4. Update `ApPublishedPost.metadata`: add `{ rolledBack: true, rollbackReason: reason, rollbackAt: now }`.
- **Idempotency:** If `ApPublishedPost.metadata.rolledBack === true`, return success immediately without re-running the transaction (already rolled back).
- **Definition of done:** skill registered in SKILL_REGISTRY; unit tests cover: successful rollback updates all three rows; calling twice is idempotent; wrong tenant ID throws; Postiz Post already deleted → still succeeds; typecheck passes.
- **Out of scope:** platform-side deletion (no Postiz provider delete API), BullMQ job cancellation (the post has already been published when rollback is called; the BullMQ job completed long ago), UI surface (Phase 5+), Analyzer agent wiring (slice 4.4).

### Phase 1 revisit — versatile orchestrator (sub-slices of 1.3)

> **Why this revisit exists.** Slice 1.3 (intent_parser) treats every chat message as an independent classification problem. When a multi-turn flow is in progress (e.g. waiting on a timing answer), the parser is blind to that state and re-classifies follow-ups like "after 5 minutes" as fresh `direct_action` requests. Combined with `chat.service.ts`'s "any direct_action while pending → cancel and restart" rule, the user gets stuck in a loop. The fix is structural: replace the classify-then-branch pipeline with an LLM **orchestrator** that sees current state and decides what to do by *calling tools* (the existing skills), not by being routed by code. Time understanding is fixed by adding `chrono-node` as a deterministic first pass.

#### Slice 1.3.a — chrono-node time parser

- **Goal:** Add a deterministic, locale-aware time-expression parser used by every tool that takes a `when` argument. Eliminates the "post or schedule it?" loop on relative inputs like "after 5 minutes", "in 2 hours", "tomorrow 9am".
- **Depends on:** none (foundation for 1.3.c+).
- **Files touched:**
  - `package.json` (root) — add `chrono-node` dependency
  - `libraries/nestjs-libraries/src/autopilot/time/parse.ts` — new file
  - `libraries/nestjs-libraries/src/autopilot/time/parse.spec.ts` — new file
- **Exported API:**
  - `ParsedTime { date: Date; isRelative: boolean; isPast: boolean; sourcePhrase: string; confidence: 'high' | 'medium' | 'low' }`
  - `parseTimeExpression(input: string, options?: { now?: Date; timezone?: string; forwardOnly?: boolean }): ParsedTime | null` — returns `null` when nothing parseable. `forwardOnly` (default `true`) treats past-only references like "3pm" (when now is 4pm) as tomorrow.
  - `formatForUser(date: Date, options?: { now?: Date; timezone?: string }): string` — humanized: "in 5 minutes", "tomorrow at 3:00 PM", "Fri Apr 25 at 3:00 PM".
- **Behavior:**
  - Relative: `"after 5 minutes"`, `"in 2 hours"`, `"in 30 seconds"` → `now + delta`, `confidence: 'high'`, `isRelative: true`.
  - Absolute (today/future): `"tomorrow 9am"`, `"Friday 3pm"`, `"next Monday at 10"` → that wall-clock moment in `timezone`, `confidence: 'high'`.
  - Bare time (`"3pm"`): if past today and `forwardOnly`, roll to tomorrow and mark `isPast: false` (we adjusted), `confidence: 'medium'`.
  - ISO 8601 (`"2026-05-01T10:00:00Z"`): pass through, `confidence: 'high'`.
  - Unparseable (`"hello"`, `""`, single digit `"3"`): return `null`.
- **Definition of done:** unit tests cover all categories above (relative, absolute, bare time forward-roll, ISO, unparseable, null timezone, explicit timezone); `formatForUser` produces the documented strings; typecheck passes; jest passes.
- **Out of scope:** wiring into existing handlers (1.3.c does that); LLM fallback for chrono failures (1.3.c will let the orchestrator decide); non-English locales (default to `chrono.casual.en`).

#### Slice 1.3.b — Orchestrator tool registry types + extended SSE event types

- **Goal:** Define the type contract that the orchestrator agent (1.3.c) will use to discover, schema-validate, and dispatch tools. Extend `ChatStreamEvent` so tool handlers can emit richer UI payloads (lists, cards, confirmations) without sentence-stream hacks.
- **Depends on:** 1.3.a (only for type-imports if needed).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/types.ts` — new
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/index.ts` — new (re-exports)
  - `libraries/nestjs-libraries/src/autopilot/chat/chat.service.ts` — extend `ChatStreamEvent` union
- **Exported API:**
  - `OrchestratorTool<I, O> { name: string; description: string; parameters: z.ZodType<I>; handler: (ctx: OrchestratorContext, input: I) => Promise<OrchestratorToolResult<O>> }`
  - `OrchestratorContext { org: Organization; user: User; db: PrismaService; llm: LlmProvider; emit: (event: ChatStreamEvent) => void; now: Date; timezone: string; logger: AgentLogger }`
  - `OrchestratorToolResult<O> { observation: string; data?: O; emitted?: boolean }` — `observation` is what the LLM sees on the next turn; `emitted` flags that an SSE side-event was already sent.
  - New SSE event types: `ChatScheduledListEvent`, `ChatAnalyticsCardEvent`, `ChatConfirmEvent`, `ChatActionResultEvent` — discriminated by `type`.
- **Definition of done:** types compile; no runtime code yet; placeholder tool registry exported as empty array.
- **Out of scope:** any actual tool implementations (those land in 1.3.c+); orchestrator agent itself.

#### Slice 1.3.c — Orchestrator agent + chat-service integration (the bug-fix slice)

- **Goal:** Replace the current intent_parser → branching pipeline (in `chat.service.ts` non-onboarding path) with an orchestrator agent that uses `generateText({ tools, … })` from `ai-v5`. Ship enough tools to make the failing scenario work end-to-end.
- **Depends on:** 1.3.a (time parser), 1.3.b (types), existing services (DirectActionHandler, slot-scheduler, stack).
- **Files touched:**
  - `libraries/nestjs-libraries/src/autopilot/agents/orchestrator.ts` — new agent
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/tools/schedule_post.ts` — new
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/tools/list_scheduled_posts.ts` — new
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/tools/cancel_pending_draft.ts` — new
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/tools/clarify_with_user.ts` — new
  - `libraries/nestjs-libraries/src/autopilot/orchestrator/state-snapshot.ts` — builds the per-turn state-snapshot block injected into the system prompt
  - `libraries/nestjs-libraries/src/autopilot/chat/chat.service.ts` — non-onboarding path now calls the orchestrator
  - specs alongside each new file
- **System prompt structure:** role + style rules + state snapshot block (`now`, `timezone`, `niche`, `connected platforms`, `active cadence`, `pending action state`, `recent scheduled count`) + tool descriptions (auto-generated from registry).
- **Tool dispatch loop:** uses `generateText` with `tools`, `maxSteps: 5`. Each tool call's `observation` becomes the next-turn input; the LLM then either calls another tool or produces final text.
- **DirectAction state machine:** kept; `schedule_post` tool internally invokes `DirectActionHandler.startFlow` / `continuePending` so the existing draft_preview UX is unchanged.
- **Definition of done:** failing scenario `"schedule a post after 2 minutes"` → `"after 5 minutes"` produces a draft preview with `publishAt` 5 minutes from now; orchestrator never re-asks the same question twice in a row in tests; typecheck + jest pass.
- **Out of scope:** non-starter tools (1.3.d–f); frontend renderers for new event types (1.3.g — until then, frontend gracefully ignores unknown SSE event types).

#### Slice 1.3.d — Management tools

- **Goal:** Cancel/reschedule/pause/rollback verbs available conversationally.
- **Depends on:** 1.3.c.
- **Files touched:**
  - `orchestrator/tools/cancel_scheduled_post.ts`, `reschedule_post.ts`, `pause_posting.ts`, `resume_posting.ts`, `rollback_published_post.ts`
  - register in tool registry
- **Underlying services:** `slot-scheduler`, `stack`, `cadence-config.service`, `rollback_post` skill.
- **Definition of done:** unit tests per tool; orchestrator can resolve commands like "cancel my Friday LinkedIn post", "reschedule it to Monday 9am", "pause Twitter for a week".
- **Out of scope:** UI confirm dialogs (1.3.g), bulk operations.

#### Slice 1.3.e — Insight tools

- **Goal:** Wire `analytics_snapshot`, `research_topic`, `scrape_competitor` skills as orchestrator tools.
- **Depends on:** 1.3.c, slices 3.4/3.5/4.1.
- **Files touched:** `orchestrator/tools/analytics_snapshot.ts`, `research_topic.ts`, `scrape_competitor.ts`.
- **Definition of done:** "how did my LinkedIn perform last week?" returns observation that LLM summarizes; "research X" calls Tavily; per-tool tests pass.

#### Slice 1.3.f — Profile/memory tools + intent_parser deprecation

- **Goal:** Surface profile updates (via existing proposal pipeline), memory read/write, and chat-history dipping. Remove `parseIntent` from the non-onboarding path entirely.
- **Depends on:** 1.3.c–e.
- **Files touched:** `orchestrator/tools/update_business_profile.ts`, `get_profile.ts`, `set_strategy_optout.ts`, `save_memory.ts`, `recall_memory.ts`, `get_older_history.ts`. `chat.service.ts` — drop `parseIntent` call; onboarding-only branch keeps using `analyzeOnboarding`.
- **Definition of done:** profile-change requests still go through `createProposal` (no direct write); memory tools round-trip; intent_parser no longer imported by chat.service.ts.

#### Slice 1.3.g — Frontend SSE event renderers

- **Goal:** Render the new event types from 1.3.b in the chat UI.
- **Depends on:** 1.3.c–f.
- **Files touched:** `apps/frontend/src/components/autopilot/chat-layout.tsx`; new components in `apps/frontend/src/components/autopilot/` (e.g. `scheduled-list-bubble.tsx`, `analytics-card.tsx`, `confirm-bubble.tsx`).
- **Definition of done:** each event type has a renderer; clicking actions in renderers calls back to backend (cancel, confirm, reschedule).
- **Out of scope:** mobile polish, animations.

### Phases 5–9 — summarized

Later phases list slice IDs and one-line goals in §Status tracker. **Before starting any slice in Phase 5+, expand it in this file** with the same structure used above (Goal / Depends on / Files / Definition of done / Out of scope). That expansion is itself the first activity of the session; commit it separately from implementation if helpful.

This keeps the guide from bloating with pre-written detail that would drift before it's used.

---

## Capability roadmap — autopilot as a full social-media-manager replacement

> **Purpose.** The slice list above (§Status tracker) covers the foundations: chat ingress, intent/orchestrator, stack + scheduler, generation, learning. This section is the **forward-looking spec** that frames the work *after* the foundation is solid: the operations the autopilot must perform to credibly replace a hired human social media manager. It exists for three reasons:
>
> 1. **Surface gaps early.** Most failures users report (e.g. the "Nothing scheduled." bug below) trace to a missing tool or a tool selected for the wrong intent. Having the full inventory in one place lets us see the gap before the user does.
> 2. **Anchor every new slice.** Phase 5+ slices should map onto items in §B; if a proposed slice doesn't, ask whether it belongs.
> 3. **Order delivery by user value.** §E sequences the work — scheduling first, configs next, analytics after, paid ads last — so the chat product gets useful before it gets exhaustive.
>
> Status markers in §B: **(✓)** = tool exists today, **(△)** = partial, **(✗)** = missing.

### A. Today's diagnosis (the "Nothing scheduled." bug — the canonical example of the gap)

What the user sees:
```
User: what are my current scheduled times?
Bot:  Nothing scheduled.
User: i know no posts. but time slots
Bot:  Nothing scheduled.
User: but isn't there any time slot set?
Bot:  Nothing scheduled.
```
Meanwhile `/config?tab=cadence` shows `09:00` is configured.

Why it happens:
1. **Wrong tool selected.** The LLM hears "scheduled times / time slots" and calls `list_scheduled_posts`, which queries `ApScheduledSlot` (queued posts), NOT `ApCadenceConfig.preferredTimes` (the user's intended meaning).
2. **No CRUD tool exists for cadence preferred times.** The state snapshot does include `active_cadence`, but the LLM ignores it and reaches for the nearest-named tool.
3. **Robotic reply.** When `list_scheduled_posts` returns `emitted: true` with zero posts, `runOrchestrator` (`agents/orchestrator.ts:244-249`) suppresses the LLM's natural-language reply — the frontend renders the empty `scheduled_list` event as the literal string `"Nothing scheduled."` There is no LLM-authored prose layer in this code path.

Minimal fix shape:
1. Add the missing config-CRUD tools (granular, one verb each, sharp descriptions so the LLM picks the right one even with typos like "schedled"): `read_time_slots`, `update_time_slots`, `update_posts_per_day`, `read_growth_rules`, `upsert_growth_rule`, `delete_growth_rule`, `read_strategy_optout`.
2. Soften emission policy: when a tool emits but result is empty/zero, allow the LLM's text reply through. Treat structured emits as complementary cards, not replacements for prose.
3. Add system-prompt rule: *"Always re-narrate tool observations in human voice; never echo raw tool output."*

### B. Comprehensive capability list

Reordered into four bands by delivery priority: **scheduling/posts → configs → analytics+listening+community → paid (last)**. Each item is `[tool_name]` (proposed name).

#### Band 1 — Post scheduling & content (the core product surface)

##### B1.1 Scheduling & calendar
- Schedule a post at a specific time — `schedule_post` ✓
- Schedule a series at intervals — `schedule_post` ✓ (intervalMinutes)
- List upcoming scheduled posts — `list_scheduled_posts` ✓
- Cancel one scheduled post — `cancel_scheduled_post` ✓
- Bulk cancel — `cancel_scheduled_post` ✓ (array form)
- Reschedule — `reschedule_post` ✓
- View posting calendar (weekly/monthly view) — `read_calendar_view` ✗
- Find best-time-to-post (per platform, audience-derived) — `compute_best_times` ✗
- Read cadence preferred times — `read_time_slots` ✗ ⚠ blocking the current bug
- Update cadence preferred times — `update_time_slots` ✗
- Set posts-per-day per platform — `update_posts_per_day` ✗
- Pause posting on a platform — `pause_posting` ✓
- Resume posting on a platform — `resume_posting` ✓
- Pause posting globally for vacation/holiday — `pause_all` ✗
- Set blackout windows ("never between 10pm–7am") — `set_blackout_window` ✗
- Set posting frequency cap ("max 3/day") — `set_frequency_cap` ✗
- Stagger across timezones — `enable_timezone_staggering` ✗

##### B1.2 Content creation
- Draft a single post (text only) — `schedule_post` ✓ (creation+schedule fused)
- Draft a series of N posts on a theme — `schedule_post` ✓ (array form)
- Draft a thread (Twitter/X, LinkedIn) — `draft_thread` ✗
- Draft a carousel (slides + caption) — `draft_carousel` ✗
- Draft a long-form post (LinkedIn article, FB note) — `draft_longform` ✗
- Draft a poll — `draft_poll` ✗
- Draft a quote tweet / reply — `draft_reply` ✗
- Generate an image for a post (DALL·E/SD) — partial via `wantsImage` flag △
- Generate alt-text for accessibility — `generate_alt_text` ✗
- Generate a video script (Reels/Shorts/TikTok) — `draft_video_script` ✗
- Generate captions/subtitles for a video — `generate_video_captions` ✗
- Generate hashtags for a draft — `suggest_hashtags` ✗
- Tune an existing draft for a specific platform — `rewrite_for_platform` ✓ (skill exists; not exposed as tool)
- Apply brand voice to any draft — `apply_brand_voice` ✗
- Translate/localise a post — `translate_post` ✗
- Add CTAs / UTM links — `add_utm_link` ✗
- Generate emoji/decoration variants — `vary_post_style` ✗

##### B1.3 Drafts & approval workflow
- List drafts (the post stack) — `list_drafts` ✗
- Read a single draft by id — `read_draft` ✗
- Edit a draft — `edit_draft` ✗
- Delete a draft — `delete_draft` ✗
- Approve / reject a draft — `approve_draft` ✗ / `reject_draft` ✗
- Bulk approve a batch — `bulk_approve_drafts` ✗
- Move a draft between platforms — `move_draft_platform` ✗
- Lock a draft to prevent edits — `lock_draft` ✗

##### B1.4 Publishing & delivery
- Publish immediately — `schedule_post` ✓ (immediate flag)
- Retry a failed publish — `retry_publish` ✗
- View failed publishes / publish errors — `list_publish_errors` ✗
- Quarantine a problematic post — `quarantine_post` ✗
- Rollback (delete from platform after publish) — `rollback_published_post` ✓

##### B1.5 Content ideation & research
- Suggest topics aligned with niche & calendar — `suggest_topics` ✗
- Pull from trending topics (Twitter trends, Google Trends, Reddit hot) — `fetch_trending` ✗
- Research a topic deeply — `research_topic` ✓
- Research/scrape a competitor — `scrape_competitor` ✓
- Find and follow industry hashtags — `find_hashtags` ✗
- Suggest content pillars / themes — `suggest_content_pillars` ✗
- Build a content calendar for N weeks — `generate_content_calendar` ✗
- Repurpose an existing piece across formats (blog → tweet → carousel) — `repurpose_content` ✗
- Pull headlines from RSS / news feeds — `fetch_news_feed` ✗
- Mine FAQs / customer questions for content — `mine_faq_content` ✗

##### B1.6 Crisis & incident
- Pause everything immediately — `pause_all` ✗
- Take down a published post — `rollback_published_post` ✓
- Issue an apology / clarification post — `draft_apology_post` ✗
- Notify stakeholders — `send_stakeholder_alert` ✗

#### Band 2 — Configs & settings (everything that shapes what the bot does, not the posts themselves)

##### B2.1 Strategy & onboarding
- Capture business niche, audience, goals, KPIs — `read_business_profile` ✓ / `update_business_profile` ✓
- Define brand voice: tone, vocabulary, emojis, hashtags, banned words — `read_brand_voice` △ (inside profile) / `update_brand_voice` △
- Define anti-patterns ("never say X", "never sell on Sunday") — `update_anti_patterns` △
- Regulatory flags (HIPAA, finance, alcohol) — `update_regulatory_flags` △
- Define growth rules ("post more on weekdays", "skip Mondays") — `read_growth_rules` ✗ / `upsert_growth_rule` ✗ / `delete_growth_rule` ✗
- Set primary geography & target timezone — `set_timezone` ✓ / `set_target_audience_geo` ✗
- Set persona objectives (awareness, leads, sales, community) — `set_objective` ✗

##### B2.2 Settings / preferences (general)
- Read all settings — `read_all_settings` ✗
- Toggle strategy data sharing — `set_strategy_optout` ✓ / `read_strategy_optout` ✗
- Toggle notifications — `set_notification_prefs` ✗
- Set posting language — `set_post_language` ✗

##### B2.3 Account & profile management
- Update bio / handle / avatar / banner — `update_profile_assets` ✗
- Manage link-in-bio — `update_bio_link` ✗
- Add/remove a connected social account — `connect_account` ✗ / `disconnect_account` ✗
- Refresh a stale OAuth token — `refresh_token` ✗
- List connected accounts + health — `list_accounts` ✗
- Set platform-specific defaults — `set_platform_defaults` ✗

##### B2.4 Knowledge & docs
- Search internal knowledge base — `search_knowledge` ✓
- Add an FAQ entry — `add_faq_entry` ✗
- Add a brand asset (logo, color, font URL) — `add_brand_asset` ✗

##### B2.5 Memory, learning, self-improvement
- Save a long-term memory — `save_memory` ✓
- Recall by query — `recall_memory` ✓
- Read older history — `get_older_history` ✓
- Learn from rejections (user said "no, don't do X again") — `record_negative_feedback` ✗
- Learn from approvals (reinforce style) — `record_positive_feedback` ✗
- Periodically self-review and propose strategy tweaks — `propose_strategy_review` ✗

##### B2.6 Compliance, brand safety, approvals
- Brand safety check on a draft (banned words, regulatory flags) — `check_brand_safety` ✗
- Plagiarism / duplicate-post check — `check_duplicates` ✗
- Image rights / license check — `check_image_rights` ✗
- Profanity / NSFW detection — `check_nsfw` ✗
- Disclosure compliance (#ad, #sponsored) — `enforce_disclosure` ✗
- Approval-required gate for senior posts — `require_human_approval` ✗
- Audit log of every AI action — `read_audit_log` ✗ (`ApActivityLog` exists, no read tool)

##### B2.7 Conversation UX (meta tools)
- Ask user a clarifying question — `clarify_with_user` ✓
- Cancel pending draft / abandon flow — `cancel_pending_draft` ✓
- Confirm before destructive action — `confirm_with_user` ✗
- Show progress on long-running task — `report_progress` ✗
- Apologise / acknowledge mistake gracefully — handled by prompt △

#### Band 3 — Analytics, listening & community (measure + react)

##### B3.1 Analytics, reporting, optimisation
- Per-platform analytics snapshot — `analytics_snapshot` ✓
- Cross-platform consolidated report — `consolidated_report` ✗
- Top-performing posts (by reach/engagement/saves) — `top_posts` ✗
- Worst-performing posts (drag analysis) — `bottom_posts` ✗
- Audience growth chart — `audience_growth` ✗
- Demographic breakdown — `audience_demographics` ✗
- Engagement-rate over time — `engagement_trend` ✗
- Hashtag performance — `hashtag_performance` ✗
- Time-of-day heatmap — `engagement_heatmap` ✗
- Funnel: post → click → conversion — `conversion_funnel` ✗
- A/B test setup — `start_ab_test` ✗
- A/B test results — `ab_test_result` ✗
- Weekly/monthly digest export (PDF/CSV) — `export_report` ✗
- Email a stakeholder report — `send_report_email` ✗
- ROI / cost-per-engagement — `compute_roi` ✗

##### B3.2 Listening & monitoring
- Set brand-mention alerts — `add_mention_alert` ✗
- Read brand-mention feed — `read_mentions` ✗
- Read sentiment summary — `read_sentiment` ✗
- Track competitor cadence/engagement — `track_competitors` ✗
- Track keyword/hashtag in real time — `track_keyword` ✗
- Detect viral moments — `detect_viral_moment` ✗
- Detect crisis spike (sudden negative sentiment) — `detect_crisis` ✗

##### B3.3 Community management — inbound
- List unread DMs across platforms — `list_dms` ✗
- Read a DM thread — `read_dm_thread` ✗
- Reply to a DM (LLM-drafted) — `reply_to_dm` ✗
- List comments on recent posts — `list_comments` ✗
- Reply to a comment — `reply_to_comment` ✗
- Like a comment — `like_comment` ✗
- Hide / delete a comment — `moderate_comment` ✗
- Detect spam / abuse comments — `flag_abusive_comment` ✗
- Pin a top comment — `pin_comment` ✗
- Auto-route urgent inbound to human — `escalate_to_human` ✗
- Save canned replies — `save_canned_reply` ✗

##### B3.4 Community management — outbound engagement
- Like target accounts' posts — `engage_like` ✗
- Comment on target accounts' posts — `engage_comment` ✗
- Follow/unfollow accounts — `follow_account` ✗ / `unfollow_account` ✗
- Reshare/retweet relevant content — `reshare_post` ✗
- Send a cold DM (with rate-limits / safety) — `send_outreach_dm` ✗
- Build & maintain target lists (prospects, influencers) — `manage_target_list` ✗

##### B3.5 CRM & lead capture
- Capture leads from DMs/comments — `capture_lead` ✗
- Sync leads to external CRM (HubSpot, etc.) — `sync_to_crm` ✗
- Tag a contact — `tag_contact` ✗

##### B3.6 Influencer / partnership
- Find candidate influencers in niche — `find_influencers` ✗
- Track partnership UTMs — `track_partner_utm` ✗
- Send partnership outreach — `send_outreach_dm` ✗ (shared with B3.4)

#### Band 4 — Paid (last)

##### B4.1 Paid / boosting
- Boost an organic post — `boost_post` ✗
- Set ad budget — `set_ad_budget` ✗
- Read ad performance — `read_ad_performance` ✗
- Pause an ad set — `pause_ads` ✗

### C. Counts at a glance

- Tools today: **20** (in `orchestrator/tools/index.ts`)
- Operations enumerated above: **~120**
- Missing (✗): **~95**
- Partial (△): **~7**

The gap is large but structured: most missing tools are thin wrappers over Prisma reads or thin wrappers over the existing skills/services. The orchestrator's ReAct loop, state-snapshot, and emission protocol do not need redesign — only an expanded, sharper-described tool catalog and a more lenient text-emission policy.

### D. Implementation plan — layering capabilities on top of existing systems

#### D.1 Anchors that are reused as-is (no redesign)
- **Orchestrator ReAct loop** — `runOrchestrator` in `autopilot/agents/orchestrator.ts`. Every new operation is a tool, not a new agent.
- **State snapshot** — `buildStateSnapshot` / `formatStateSnapshot`. New state surfaces (e.g. blackout windows, mention alerts) extend the snapshot rather than spawn a parallel context channel.
- **Tool factory pattern** — `createXxxTool(deps): OrchestratorTool<I,O>` in `autopilot/orchestrator/tools/*.ts`, registered in `buildOrchestratorTools` (`tools/index.ts`).
- **Existing services** — `DirectActionHandler`, `CadenceConfigService`, `SlotSchedulerService`, stack push/pop, `pop-and-publish`, `rewrite_for_platform` skill, `analytics_snapshot` skill, memory service. New tools wrap these; they do not duplicate Prisma writes.
- **Postiz publisher** — multi-platform poster reused for any platform-write tool (DMs, comments, likes once scopes are added).
- **Chat ingress + SSE event protocol** — extend `ChatStreamEvent` union for new card types (e.g. `mentions_feed`, `analytics_chart`); no protocol replacement.
- **`ApActivityLog`** for audit, **`ApCreditLedger`** for cost, **`createProposal` pipeline** for any change requiring user confirmation.

#### D.2 Tool-design patterns every new tool must follow
- One file per tool under `autopilot/orchestrator/tools/`, factory-exported as `createXxxTool(deps)`.
- Zod input schema; structured `observation` string for the LLM; optional `data` payload.
- **Emission policy (revised):** never suppress the LLM's prose when a tool's emit has empty/zero content. Structured emits are *complementary* UI cards, not replacements for an authored reply. Update `runOrchestrator` to check `result.data` size before suppressing.
- Sharp, distinguishing one-line `description` — include a "NOT for X" hint when the tool is near a confusable peer (e.g. `read_time_slots` description says: "Reads cadence preferred times. NOT for listing scheduled posts — use list_scheduled_posts for that.").
- Always reuse the existing service for the underlying mutation; never write Prisma directly when a service exists.
- Every tool gets a `*.spec.ts` next to it (matches existing convention).
- Register in `buildOrchestratorTools` barrel.

#### D.3 Tool-catalog scaling — keep the LLM from drowning in tools
At ~120 tools, prompt context bloats and tool-selection accuracy drops. Mitigations, in order of investment:
1. **Sharp descriptions + cross-links** (cheap; do from the start).
2. **Namespacing** — group tool names by family: `cadence.read_time_slots`, `cadence.update_time_slots`, `analytics.top_posts`, `comments.reply`. The model finds the right family faster.
3. **Two-tier tool router** (later) — a small first-pass agent picks a *family* (e.g. "this is a cadence question") and only that family's tools are exposed to the main orchestrator. Defer until tool count > ~50 actually causes selection regressions in eval.
4. **Per-tier scoping** — cheaper tiers see a reduced catalog; expensive tools (research, scrape) are gated behind credit checks before the model can call them.

#### D.4 New data models vs. existing tables
- **Existing tables suffice** for: cadence read/write, growth rules CRUD, drafts (`ApPostCandidate`), scheduled slots, profile, memory, audit log, knowledge, strategy patterns.
- **New tables needed** (introduce per the slice that needs them, not up front):
  - `ap_blackout_window` — for `set_blackout_window` (B1.1).
  - `ap_objective` — for `set_objective` (B2.1).
  - `ap_comment_log`, `ap_dm_log` — for community management (B3.3/B3.4).
  - `ap_mention_alert` — for listening (B3.2).
  - `ap_target_list` — for outbound engagement (B3.4).
  - `ap_ab_test` — for A/B (B3.1).
  - `ap_lead` — for CRM (B3.5).
  - `ap_ad_campaign` — for paid (B4.1).
- Every new model gets `@@map`'d to `ap_*` and back-related to `Organization` per existing convention.

#### D.5 External integrations & OAuth scopes
- Bands 1–2 need **no new scopes** beyond what Postiz already requests.
- Band 3 inbound (DMs, comments, mentions) requires per-platform read scopes — flagged as a per-integration prereq slice, not a tool concern.
- Band 3 outbound (like, follow, reshare) requires write scopes that some platforms restrict (e.g. Twitter/X v2 limits, Meta Graph permissions). Each affected platform gets its own enablement slice.
- Band 4 (paid) requires Ads API scopes — separate auth flow per platform.

#### D.6 Background jobs / crons added per band
- Bands 1–2: **none** — all tools are request/response.
- Band 3: mention-listener cron (poll per platform), sentiment-scorer worker, A/B result harvester, viral-moment detector.
- Band 4: ad-performance snapshotter cron.
- All new crons live in `apps/cron/src/tasks/` and register via `cron.module.ts` (matches existing pattern).

#### D.7 Quality, cost & safety hooks
- Every write/destructive tool calls the existing **`createProposal` → confirm → apply** pipeline by default; bypass only for pure reads or non-destructive writes (e.g. saving a memory).
- **`check_brand_safety`** runs as a pre-flight inside `schedule_post` and `boost_post` once implemented.
- **`require_human_approval`** is a tool the orchestrator can call when uncertain; it flips the draft to `pending_human` and stops auto-publish.
- **`ApCreditLedger`** debits per-tool cost via existing `debitCredits`; high-cost tools (research, scrape, ad spend setting) gated by `registerSkillGate`.

#### D.8 Testing & rollback
- One spec per tool (existing convention).
- New crons get a smoke spec.
- **Feature flag per band** (env or DB-driven) so a band can ship dark and be enabled per tenant. Add to `configuration.checker.ts`.
- Each band ends with a chat-service integration test that exercises a representative end-to-end flow (e.g. "user asks about time slots → bot reads cadence → bot replies in human voice").

#### D.9 Risks & open questions
- **Tool-count overflow** before D.3 step 3 lands. Watch for tool-selection regressions in eval as the catalog grows past ~40.
- **Rate limits** on engagement actions (Twitter/X, Instagram). Need a per-platform throttle service before B3.4 ships.
- **OAuth scope churn** breaking existing Postiz integrations when we ask for additional scopes. Coordinate with the existing integration refresh path.
- **Cost of LLM-narrated replies on every tool call** — emitting prose alongside cards increases token spend per turn. Tradeoff worth tracking; cheap models for narration may be enough.

### E. Rollout order

Bands deliver in priority order. Each numbered item is one slice unless flagged "(multi-slice)".

#### E.1 — Scheduling/posts band
1. [x] **Fix the immediate bug** — add `read_time_slots` + relax emission so empty results get a natural reply.
2. [x] **Cadence CRUD** — `update_time_slots`, `update_posts_per_day`, `pause_all`, `set_blackout_window`, `set_frequency_cap`.
3. [x] **Drafts/stack CRUD** — `list_drafts`, `read_draft`, `edit_draft`, `delete_draft`, `approve_draft` / `reject_draft`.
4. [x] **Calendar & best-time** — `read_calendar_view`, `compute_best_times`.
5. [x] **Content creation expansion** — `draft_thread`, `draft_carousel`, `draft_longform`, `draft_poll`, `apply_brand_voice`, `suggest_hashtags`, `translate_post`. (multi-slice)
6. [x] **Publishing reliability** — `retry_publish`, `list_publish_errors`, `quarantine_post`.
7. [x] **Ideation tools** — `suggest_topics`, `fetch_trending`, `generate_content_calendar`, `repurpose_content`. (multi-slice)
8. [ ] **Crisis tools** — `draft_apology_post`, `send_stakeholder_alert`.

#### E.2 — Configs band
9. [ ] **Growth rules CRUD** — `read_growth_rules`, `upsert_growth_rule`, `delete_growth_rule`.
10. [ ] **Profile & brand voice** — `read_brand_voice`, `update_brand_voice`, `update_anti_patterns`, `update_regulatory_flags`, `set_objective`, `set_target_audience_geo`.
11. [ ] **Settings, accounts & docs** — `read_all_settings`, `set_notification_prefs`, `set_post_language`, `list_accounts`, `connect_account` / `disconnect_account`, `add_faq_entry`, `add_brand_asset`.
12. [ ] **Compliance & approvals** — `check_brand_safety`, `check_duplicates`, `check_nsfw`, `enforce_disclosure`, `require_human_approval`, `read_audit_log`.
13. [ ] **Memory & feedback loops** — `record_negative_feedback`, `record_positive_feedback`, `propose_strategy_review`.
14. [ ] **Conversation UX polish** — `confirm_with_user`, `report_progress`.

#### E.3 — Analytics, listening & community band
15. [ ] **Analytics deep dive** — `top_posts`, `bottom_posts`, `engagement_trend`, `engagement_heatmap`, `hashtag_performance`, `audience_growth`, `audience_demographics`, `consolidated_report`. (multi-slice)
16. [ ] **A/B + reporting** — `start_ab_test`, `ab_test_result`, `export_report`, `send_report_email`, `compute_roi`, `conversion_funnel`. (multi-slice)
17. [ ] **Listening** — `add_mention_alert`, `read_mentions`, `read_sentiment`, `track_competitors`, `track_keyword`, `detect_viral_moment`, `detect_crisis`. (multi-slice)
18. [ ] **Community inbound** — DMs + comments read/reply/moderate. (multi-slice)
19. [ ] **Community outbound** — `engage_like`, `engage_comment`, `follow_account`/`unfollow_account`, `reshare_post`, `send_outreach_dm`, `manage_target_list`. (multi-slice)
20. [ ] **CRM & influencer** — `capture_lead`, `sync_to_crm`, `tag_contact`, `find_influencers`, `track_partner_utm`. (multi-slice)

#### E.4 — Paid band (last)
21. [ ] **Paid / boosting** — `boost_post`, `set_ad_budget`, `read_ad_performance`, `pause_ads`. (multi-slice)

---

### F. Slice expansions

#### F.E.1 — Fix the immediate bug (`read_time_slots` + emission policy)

**Goal:** Eliminate the "Nothing scheduled." loop (§A) by (a) adding a correctly-named tool the LLM will pick for cadence-time questions, and (b) allowing LLM prose through when an emitting tool returns empty data.

**Files:**
- NEW `orchestrator/tools/read_time_slots.ts` — pure read of `ApCadenceConfig.preferredTimes` + `postsPerDay` per platform; no emitted card, LLM narrates
- NEW `orchestrator/tools/read_time_slots.spec.ts`
- MOD `orchestrator/types.ts` — add `suppressText?: boolean` to `OrchestratorToolResult`; when `false`, orchestrator lets LLM prose through even if `emitted: true`
- MOD `agents/orchestrator.ts` — suppression check uses `suppressText !== false`; update system-prompt rule to "Always re-narrate tool observations in human voice"
- MOD `orchestrator/tools/list_scheduled_posts.ts` — set `suppressText: posts.length > 0` so empty results no longer swallow prose
- MOD `orchestrator/tools/index.ts` — register `createReadTimeSlotsTool`

**Definition of done:**
- `read_time_slots` returns per-platform preferred times and `postsPerDay` as a human-readable observation (no UI card)
- `list_scheduled_posts` description updated with "NOT for reading time-slot config — use `read_time_slots` for that"
- `read_time_slots` description says "NOT for listing upcoming posts — use `list_scheduled_posts` for that"
- LLM prose is emitted when any emitting tool has `suppressText: false` (e.g. empty scheduled list)
- All autopilot tests green; `read_time_slots.spec.ts` covers ≥ 6 cases

**Out of scope:** `update_time_slots`, `update_posts_per_day`, `pause_all`, `set_blackout_window`, `set_frequency_cap` (E.2).

#### F.E.2 — Cadence CRUD (`update_time_slots`, `update_posts_per_day`, `pause_all`, `set_blackout_window`, `set_frequency_cap`)

**Goal:** Complete the cadence write surface so the LLM can update posting times/frequency and set blackout windows via chat — the complement to the `read_time_slots` read tool added in E.1.

**Files:**
- MOD `schema.prisma` — new `ApBlackoutWindow` model (startHour, endHour, timezone, label, active) + Organization back-relation `apBlackoutWindow`
- NEW `orchestrator/tools/update_time_slots.ts` + `.spec.ts` — sets `preferredTimes` on one platform via `applyCadenceConfig`; normalises HH:MM input
- NEW `orchestrator/tools/update_posts_per_day.ts` + `.spec.ts` — sets `postsPerDay` on one platform via `applyCadenceConfig`
- NEW `orchestrator/tools/pause_all.ts` + `.spec.ts` — pauses ALL active platforms; wraps `CadenceConfigService.pause()`; ergonomic vacation-mode alias for `pause_posting` with no platform filter
- NEW `orchestrator/tools/set_blackout_window.ts` + `.spec.ts` — creates row in `ApBlackoutWindow`; does not yet enforce in scheduler (future)
- NEW `orchestrator/tools/set_frequency_cap.ts` + `.spec.ts` — applies `postsPerDay` to specified platforms or all active platforms via `applyCadenceConfig`
- MOD `orchestrator/tools/index.ts` — register 5 new tools

**Definition of done:**
- All 5 tools emit `action_result`; write through `applyCadenceConfig` or `CadenceConfigService` (no raw duplicate Prisma logic)
- `set_blackout_window` writes to new `ApBlackoutWindow` table; schema pushed + client regenerated
- Descriptions distinguish confusable peers (`pause_all` vs `pause_posting`, `update_posts_per_day` vs `set_frequency_cap`)
- All autopilot tests green; each new tool has ≥ 5 spec cases

**Out of scope:** Enforcing blackout windows in `SlotSchedulerService` (future); `list_drafts`, `read_draft` (E.3).

#### F.E.3 — Drafts/stack CRUD (`list_drafts`, `read_draft`, `edit_draft`, `delete_draft`, `approve_draft`, `reject_draft`)

**Goal:** Give the LLM full read/write control over the `ApPostCandidate` (draft) queue so users can inspect, edit, and triage pending posts via chat.

**Files:**
- NEW `orchestrator/tools/list_drafts.ts` + `.spec.ts` — list PENDING candidates, optional platform/limit filter; pure read, LLM narrates
- NEW `orchestrator/tools/read_draft.ts` + `.spec.ts` — return one candidate by ID with full content and metadata; pure read
- NEW `orchestrator/tools/edit_draft.ts` + `.spec.ts` — update `content` on a PENDING candidate; guards non-PENDING; emits `action_result`
- NEW `orchestrator/tools/delete_draft.ts` + `.spec.ts` — soft-delete by setting status to FAILED + metadata `{ deleted_by: 'user' }`; emits `action_result`
- NEW `orchestrator/tools/approve_draft.ts` + `.spec.ts` — boost PENDING candidate `priority` to 100 and stamp `metadata.approved_at`; emits `action_result`
- NEW `orchestrator/tools/reject_draft.ts` + `.spec.ts` — set status FAILED + metadata `{ rejected_by: 'user' }`; emits `action_result`
- MOD `orchestrator/tools/index.ts` — register 6 new tools

**Definition of done:**
- All tools are tenant-scoped (`organizationId: ctx.org.id` on every query)
- Write tools guard status: edit/approve reject if status ≠ PENDING; delete/reject also accept SCHEDULED
- No new Prisma schema changes (existing `ApPostCandidate` + `ApPostCandidateStatus` suffice)
- All autopilot tests green; each tool ≥ 5 spec cases

**Out of scope:** `read_calendar_view`, `compute_best_times` (E.4); bulk approve, move_draft_platform, lock_draft (future).

#### F.E.5 — Content creation expansion (`draft_thread`, `draft_carousel`, `draft_longform`, `draft_poll`, `apply_brand_voice`, `suggest_hashtags`, `translate_post`)

**Goal:** Add seven content-generation tools to the orchestrator so users can create rich post formats (threads, carousels, long-form, polls) and request post-processing (brand-voice application, hashtag suggestions, translation) via chat.

**Files:**
- NEW `orchestrator/tools/draft_thread.ts` + `.spec.ts` — generate N connected thread posts via LLM (uses `ctx.llm.model` + `generateObject`); push each part as a separate `ApPostCandidate` with `metadata.threadId` linking them; emits `action_result`
- NEW `orchestrator/tools/draft_carousel.ts` + `.spec.ts` — generate carousel slides (title + body text per slide) via LLM; push as single candidate with `contentVariants.slides`; emits `action_result`
- NEW `orchestrator/tools/draft_longform.ts` + `.spec.ts` — generate long-form post (LinkedIn article / Facebook note) via LLM; push as single candidate; emits `action_result`
- NEW `orchestrator/tools/draft_poll.ts` + `.spec.ts` — no LLM; formats user-supplied question + options as poll metadata; push as candidate with `metadata.poll`; emits `action_result`
- NEW `orchestrator/tools/apply_brand_voice.ts` + `.spec.ts` — load profile via `getStructuredProfile`; rewrite supplied content via LLM to match brand voice + platform; pure read (returns rewritten text, no stack push)
- NEW `orchestrator/tools/suggest_hashtags.ts` + `.spec.ts` — given content + platform, return 3–10 suggested hashtags via LLM; pure read (returns list, no stack push)
- NEW `orchestrator/tools/translate_post.ts` + `.spec.ts` — translate content to target language via LLM; pure read (returns translated text, no stack push)
- MOD `orchestrator/tools/index.ts` — register 7 new tools

**Definition of done:**
- `draft_thread`: accepts `topic`, `platform` (default `'twitter'`), `threadLength` (2–10, default 5), optional `guidelines`; generates structurally cohesive thread parts; pushes each as a separate PENDING candidate; `metadata.threadId` is shared across parts; observation names how many parts were pushed
- `draft_carousel`: accepts `topic`, `platform` (default `'instagram'`), `slideCount` (2–10, default 5), optional `guidelines`; generates `{title, text}` per slide; pushes single candidate; observation names platform and slide count
- `draft_longform`: accepts `topic`, `platform` (default `'linkedin'`), optional `guidelines`, optional `wordCount` (200–3000, default 800); generates body text; pushes single candidate; observation confirms push
- `draft_poll`: accepts `question: string`, `options: string[]` (2–4 items), `platform`; no LLM; validates option count; pushes candidate with `metadata.poll = { question, options }`; emits `action_result`
- `apply_brand_voice`: accepts `content`, `platform`, optional `guidelines`; gracefully falls back to minimal profile when no business profile exists; returns rewritten content in observation (no stack push)
- `suggest_hashtags`: accepts `content`, `platform`, optional `count` (3–10, default 5); returns hashtag list; observation is comma-separated list (no stack push)
- `translate_post`: accepts `content`, `targetLanguage`, optional `sourcePlatform`; returns translated content in observation (no stack push)
- Stack-push tools use `push()` from `../../stack` with `source='chat_agent'` and `priority=10`
- All LLM calls use `ctx.llm.model` with `generateObject` from `ai-v5`; profile reads cast `ctx.db as unknown as PrismaClient`
- All tools are tenant-scoped
- No new Prisma schema changes
- All autopilot tests green; each tool ≥ 5 spec cases

**Out of scope:** Bulk thread scheduling, carousel image generation (future `wantsImage` wiring), `draft_reply` / `draft_quote_tweet` (future), `vary_post_style` / `add_utm_link` (future), publishing wiring for polls (platform-specific API — no Postiz poll support yet).

---

#### F.E.7 — Ideation tools (`suggest_topics`, `fetch_trending`, `generate_content_calendar`, `repurpose_content`)

**Goal:** Give the LLM four content-ideation tools so users can get topic ideas, discover trending subjects, plan a content calendar, and repurpose existing pieces across formats — all from chat.

**Files:**
- NEW `orchestrator/tools/suggest_topics.ts` + `.spec.ts` — loads profile (niche, goals) and upcoming scheduled slots; uses LLM to generate N topic ideas that fill calendar gaps; pure read, no stack push
- NEW `orchestrator/tools/fetch_trending.ts` + `.spec.ts` — searches for trending topics in the tenant's niche via `searchTavily`; gracefully falls back to LLM-only suggestions when `AP_TAVILY_API_KEY` absent; pure read
- NEW `orchestrator/tools/generate_content_calendar.ts` + `.spec.ts` — uses LLM to produce a N-week content calendar (topic + format + platform per slot); pure read, LLM narrates
- NEW `orchestrator/tools/repurpose_content.ts` + `.spec.ts` — takes existing content text and target formats (`'thread'|'carousel'|'short'|'longform'`); generates a repurposed version per format via LLM; optionally pushes results to stack; emits `action_result` when pushing, otherwise pure read
- MOD `orchestrator/tools/index.ts` — register 4 new tools

**Definition of done:**
- `suggest_topics`: accepts `count` (1–20, default 5), optional `platform`, optional `theme` hint; observation is a numbered list of topic ideas with a brief rationale; falls back gracefully when no profile exists
- `fetch_trending`: accepts `niche` (overrides profile niche), optional `platform`, optional `count` (3–10, default 5); calls `searchTavily` when key present; on error/missing key falls back to LLM brainstorm; observation is a numbered list
- `generate_content_calendar`: accepts `weeks` (1–4, default 2), optional `platform`, optional `postsPerWeek` (1–7, default 3); LLM generates structured list of `{week, topic, format, platform}`; observation is a formatted calendar preview
- `repurpose_content`: accepts `content` (original text), `targetFormats` (array of `'thread'|'carousel'|'short'|'longform'`, at least 1), optional `platform`, optional `pushToDraft` (bool, default false); when `pushToDraft=true`, pushes each repurposed version as a PENDING candidate and emits `action_result`; otherwise pure read
- No new Prisma schema; no new migrations
- All autopilot tests green; each tool ≥ 5 spec cases

**Out of scope:** `mine_faq_content`, `pull_headlines_rss`, `find_hashtags` (future); scheduling the generated calendar (user would follow up with `schedule_post`); `fetch_trending` integrations beyond Tavily (Reddit, Twitter trends — future).

---

#### F.E.6 — Publishing reliability (`list_publish_errors`, `retry_publish`, `quarantine_post`)

**Goal:** Give the LLM visibility into and control over failed/skipped publishing events so users can see what went wrong and take corrective action (retry or quarantine) from chat.

**Data sources (all existing — no new schema):**
- `ApScheduledSlot.status = SKIPPED` rows carry `metadata.skipReason`; these are the primary "failed publish" signal (slot fired but publishing was skipped due to no integration, empty stack, or an unhandled error)
- `ApPostCandidate.status = FAILED` with `metadata.quarantined` flag for quarantine state
- Postiz `Post.state = ERROR` linked via `ApPublishedPost.postizPostId` (secondary — platform-level errors)

**Files:**
- NEW `orchestrator/tools/list_publish_errors.ts` + `.spec.ts` — lists SKIPPED slots (+ optionally ERROR Postiz posts) for the tenant; optional `platform` + `limit`; pure read, LLM narrates
- NEW `orchestrator/tools/retry_publish.ts` + `.spec.ts` — given a SKIPPED slot ID, creates a fresh PENDING `ApScheduledSlot` for the same `(org, platform)` at a specified `when` (or now + 5 min); emits `action_result`
- NEW `orchestrator/tools/quarantine_post.ts` + `.spec.ts` — marks a PENDING `ApPostCandidate` as `FAILED` with `metadata.quarantined = true`; prevents it from ever being popped again; emits `action_result`
- MOD `orchestrator/tools/index.ts` — register 3 new tools

**Definition of done:**
- `list_publish_errors`: accepts optional `platform`, `limit` (1–50, default 20), `lookbackDays` (1–90, default 7); returns SKIPPED slots with `skipReason`, platform, `scheduledAt`; observation is a numbered list; description distinguishes from `list_scheduled_posts`
- `retry_publish`: accepts `slotId` (SKIPPED slot to retry), optional `when` (parsed via `parseTimeExpression`; defaults to now + 5 minutes); guards against retrying non-SKIPPED slots; creates new PENDING slot; emits `action_result`; observation confirms new slot time
- `quarantine_post`: accepts `candidateId`, optional `reason`; guards against quarantining non-PENDING candidates; sets `status = FAILED`, `metadata.quarantined = true`, `metadata.quarantineReason`; emits `action_result`
- No new Prisma schema; no new migrations
- All autopilot tests green; each tool ≥ 5 spec cases

**Out of scope:** Automatic retry cron (future), platform-level error codes from Postiz `Post.state = ERROR` (surface is incomplete without integration-specific parsing), bulk retry (future), unquarantine/restore (future).

---

#### F.E.4 — Calendar & best-time (`read_calendar_view`, `compute_best_times`)

**Goal:** Give the LLM two new read-only scheduling-intelligence tools: a calendar view that shows scheduled posts grouped by day, and a best-time advisor that analyses the tenant's posting history to recommend optimal hours per platform.

**Files:**
- NEW `orchestrator/tools/read_calendar_view.ts` + `.spec.ts` — reads `ApScheduledSlot` rows for a date range, groups them by calendar day (in tenant timezone); pure read, LLM narrates
- NEW `orchestrator/tools/compute_best_times.ts` + `.spec.ts` — reads `ApPublishedPost` rows for the last N days, buckets `publishedAt` by hour-of-day (tenant timezone), returns top-hours per platform; falls back to generic platform advice when no history exists
- MOD `orchestrator/tools/index.ts` — register `createReadCalendarViewTool`, `createComputeBestTimesTool`

**Definition of done:**
- `read_calendar_view` accepts optional `startDate` (ISO date string, default today), `weeks` (1–8, default 2), and `platform` filter; returns slots grouped by date with platform + content snippet; observation is a compact day-by-day textual calendar
- `compute_best_times` accepts optional `platform` and `lookbackDays` (7–90, default 30); when history exists, returns top 3 hours per platform sorted by publish frequency; when history is empty returns a hardcoded per-platform recommendation note; observation is a concise human-readable recommendation
- Both tools are tenant-scoped (`organizationId: ctx.org.id` on every query)
- No new Prisma schema changes — `ApScheduledSlot` and `ApPublishedPost` already exist
- All autopilot tests green; each tool has ≥ 5 spec cases

**Out of scope:** Calendar SSE card type (LLM narrates inline); analytics-weighted best times (requires per-post analytics join, complex — future); `enable_timezone_staggering` (separate future tool); `read_calendar_view` + `compute_best_times` descriptions include cross-links to prevent confusion with `list_scheduled_posts` and `read_time_slots`.

---

### G. Roadmap build log

2026-04-28 | E.1 | orchestrator/tools/read_time_slots.ts, read_time_slots.spec.ts, orchestrator/tools/index.ts, orchestrator/types.ts, agents/orchestrator.ts, orchestrator/tools/list_scheduled_posts.ts
2026-04-28 | E.2 | schema.prisma (ApBlackoutWindow), orchestrator/tools/{update_time_slots,update_posts_per_day,pause_all,set_blackout_window,set_frequency_cap}.ts + *.spec.ts, tools/index.ts
2026-04-28 | E.3 | orchestrator/tools/{list_drafts,read_draft,edit_draft,delete_draft,approve_draft,reject_draft}.ts + *.spec.ts, tools/index.ts
2026-04-29 | E.4 | orchestrator/tools/{read_calendar_view,compute_best_times}.ts + *.spec.ts, tools/index.ts; 565 autopilot tests green (+18)
2026-04-29 | E.5 | orchestrator/tools/{draft_thread,draft_carousel,draft_longform,draft_poll,apply_brand_voice,suggest_hashtags,translate_post}.ts + *.spec.ts, tools/index.ts; 610 autopilot tests green (+45)
2026-04-29 | E.6 | orchestrator/tools/{list_publish_errors,retry_publish,quarantine_post}.ts + *.spec.ts, tools/index.ts; 634 autopilot tests green (+24)
2026-04-29 | E.7 | orchestrator/tools/{suggest_topics,fetch_trending,generate_content_calendar,repurpose_content}.ts + *.spec.ts, tools/index.ts; 670 autopilot tests green (+36)

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
2026-04-20 | 2.12 | done | autopilot/stack/cadence-config.service.ts (CadenceConfigService: pause, resume, get, isPaused; applyCadenceConfig applier registered for 'cadence_config' entity); cadence-config.spec.ts (18 tests pass); api.module.ts updated (CadenceConfigService in providers); 205 autopilot tests green
2026-04-20 | 3.1 | done | autopilot/agents/copywriter.ts (runCopywriter, copywriterAgent; voice-aware platform-specific draft generation via generateObject + getStructuredProfile + queryVector); copywriter.spec.ts (19 tests pass); agents/index.ts updated; 224 autopilot tests green
2026-04-20 | 3.2 | done | autopilot/agents/fan_out.ts (runFanOut, fanOutAgent; resolves platforms from cadence config, calls runCopywriter per platform, pushes to stack); fan_out.spec.ts (14 tests pass); agents/index.ts updated; typecheck green
2026-04-20 | 3.3 | done | autopilot/skills/rewrite_for_platform.ts (handleRewrite, buildRewritePrompt, rewriteForPlatformSkill; voice-aware cross-platform rewrite via generateObject); rewrite_for_platform.spec.ts (18 tests pass); skills/index.ts updated (SKILL_REGISTRY first entry); agents/copywriter.ts (exported PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC, PlatformSpec); skill-costs.ts updated; 286 autopilot tests green
2026-04-20 | 3.4 | done | autopilot/agents/researcher.ts (searchTavily via native fetch, runResearcher with LLM summary, researcherAgent); researcher.spec.ts (30 tests pass); agents/index.ts updated; skill-costs.ts updated (research_topic: 2)
2026-04-20 | 3.5 | done | autopilot/agents/researcher.ts (runApifyActor generic actor runner with poll loop, scrapeCompetitor with COMPETITOR_URL_TEMPLATES for 7 platforms, AP_APIFY_SCRAPER_ACTOR override); researcher.spec.ts expanded; skill-costs.ts updated (research_competitor: 5); 286 autopilot tests green
2026-04-20 | 4.1 | done | autopilot/skills/analytics_snapshot.ts (handleAnalyticsSnapshot, analyticsSnapshotSkill; resolves Integration from DB, delegates to socialIntegrationList provider.analytics(), graceful fallback for unsupported/errored providers); analytics_snapshot.spec.ts (16 tests); skills/index.ts + skill-costs.ts updated; 310 autopilot tests green
2026-04-20 | 4.2 | done | autopilot/skills/rollback_post.ts (handleRollback, rollbackPostSkill; atomic $transaction: soft-delete Postiz Post, mark ApPostCandidate FAILED, annotate ApPublishedPost metadata; idempotent; tenant-scoped); rollback_post.spec.ts (8 tests); skills/index.ts + skill-costs.ts updated; 310 autopilot tests green
2026-04-20 | 4.3 | done | schema.prisma (ApStrategyPattern + ApStrategyPatternType enum + @@unique([platform,patternKey]); ApTenantStrategyOptout + @unique organizationId + Organization back-relation); db push applied; client regenerated
2026-04-20 | 4.4+4.5 | done | autopilot/agents/analyzer.ts (runAnalyzer, analyzerAgent; loads posts+profile, generateObject for insights+patterns, writes LEARNING memories, upserts ApStrategyPattern respecting opt-out); analyzer.spec.ts (26 tests); agents/index.ts updated; 336 autopilot tests green; typecheck green
2026-04-20 | 4.6 | done | autopilot/chat/proposals.ts (applyTenantStrategyOptout: upsert on optedOut=true, deleteMany on optedOut=false; registered at module load); agents/intent_parser.ts (tenant_strategy_optout added to ENTITIES in system prompt); chat/chat.service.ts (loads opt-out status alongside profile, strategyOptout in tenantCtx, _buildReplyPrompt includes data-sharing status, getStrategyOptoutStatus method); autopilot-chat.controller.ts (GET /autopilot/chat/settings/strategy-optout); proposals.spec.ts (6 new opt-out applier tests, 342 total green); chat-layout.tsx (Manage data sharing settings chip, describeChanges helper for opt-out proposal bubble); typecheck green
2026-04-23 | 1.3.a | done | package.json (chrono-node ^2.9.0); autopilot/time/parse.ts (parseTimeExpression, formatForUser; ISO short-circuit + chrono with tz-aware ref + wallClockToUtc + seconds); time/parse.spec.ts (28 tests covering relative/absolute/forward-roll/ISO/multi-tz/format); reuses wallClockToUtc from stack/slot-scheduler.service.ts; 370 autopilot tests green; typecheck green
2026-04-24 | 1.3.b | done | autopilot/orchestrator/types.ts (OrchestratorContext, OrchestratorTool, OrchestratorToolResult, OrchestratorLogger; Zod-typed parameters; compile-time stub via z.infer); orchestrator/index.ts (barrel re-exports); chat/chat.service.ts (ChatStreamEvent extended with ChatScheduledListEvent, ChatAnalyticsCardEvent, ChatConfirmEvent, ChatActionResultEvent); ORCHESTRATOR_TOOLS placeholder empty array; 370 autopilot tests green; typecheck green (no new errors)
2026-04-24 | 1.3.c | done | autopilot/agents/orchestrator.ts (runOrchestrator + adaptToolsForAiSdk + buildSystemPrompt; generateText with stopWhen=stepCountIs(5); trace capture + emission-suppression); orchestrator/state-snapshot.ts (buildStateSnapshot + formatStateSnapshot; parallel prisma queries for integrations/cadence/pending/upcoming slots); orchestrator/tools/{schedule_post,list_scheduled_posts,cancel_pending_draft,clarify_with_user}.ts + tools/index.ts (buildOrchestratorTools factory); orchestrator/index.ts extended to re-export snapshot + tools; chat/chat.service.ts (non-onboarding path routes direct_action OR live-pending through orchestrator; config_change_request still uses proposals; legacy wantsAbort path removed); specs alongside each new file (agents/orchestrator.spec.ts, chat/chat.service.spec.ts, orchestrator/state-snapshot.spec.ts, tools/*.spec.ts); 431 autopilot tests green (+61); typecheck green; fixes "after 5 minutes" scheduling loop
2026-04-24 | 1.3.d | done | orchestrator/tools/{cancel_scheduled_post,reschedule_post,pause_posting,resume_posting,rollback_published_post}.ts + *.spec.ts; tools/index.ts (OrchestratorToolDeps += cadenceConfig; 9-tool registry); orchestrator/index.ts (re-exports 5 new factories); agents/orchestrator.ts (threads cadenceConfig into buildOrchestratorTools); chat/chat.service.ts (injects CadenceConfigService + passes cadenceConfig to runOrchestrator); agents/orchestrator.spec.ts + chat/chat.service.spec.ts (fixture + mock fixes for new dep); 465 autopilot tests green (+34); rollback_published_post wraps handleRollback skill via inline SkillContext adapter
2026-04-24 | 1.3.g | done | apps/frontend/src/components/autopilot/chat-layout.tsx (ScheduledListMsg/ActionResultMsg/ConfirmMsg types; SSE switch cases for scheduled_list/action_result/confirm; done handler updated for specialEmitted; ScheduledListBubble with per-row Cancel+Reschedule actions; ActionResultBubble with green/red icon; ConfirmBubble with confirm/cancel buttons + API call; CheckIcon/XIcon SVGs; truncateText/formatScheduledAt helpers; MessageRow props extended; handleConfirmDecision/handlePrefillInput callbacks); typecheck green
2026-04-25 | 1.3.f | done | orchestrator/tools/{update_business_profile,set_strategy_optout,save_memory,recall_memory,get_older_history}.ts + *.spec.ts (34 new tests); get_profile.spec.ts; tools/index.ts (18-tool registry); orchestrator/index.ts (re-exports 6 new factories); chat/chat.service.ts (removed parseIntent import + all intent-branching; removed _isCancellationMessage + _buildReplyPrompt; normal flow now calls runOrchestrator directly); chat/chat.service.spec.ts (rewritten to match orchestrator-only routing); 530 autopilot tests green (+34); profile/optout tools use createProposal pipeline (no direct writes)
2026-04-24 | 1.3.e | done | orchestrator/tools/{analytics_snapshot,research_topic,scrape_competitor}.ts + *.spec.ts (31 new tests); tools/index.ts (12-tool registry); orchestrator/index.ts (re-exports 3 new factories); chat/chat.service.ts (resolve timezone from first active ApCadenceConfig, fallback UTC — fixes 1.3.e TODO); chat/chat.service.spec.ts (apCadenceConfig mock); agents/orchestrator.spec.ts (mock analytics_snapshot skill to break socialIntegrationList import chain under noImplicitReturns); 496 autopilot tests green (+31); analytics_snapshot bridges SkillContext + emits analytics_card; research_topic + scrape_competitor bridge AgentContext + catch errors gracefully
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
- 2026-04-23 — added Phase 1 revisit: sub-slices 1.3.a–1.3.g for the versatile orchestrator (replaces the rigid intent_parser → branching flow with a tool-use agent + chrono-node time parser). Motivated by "after N minutes" scheduling loop.
- 2026-04-28 — added §Capability roadmap (parts A–E): purpose, "Nothing scheduled." bug diagnosis, full ~120-operation capability inventory (4 priority bands), implementation plan layered on existing systems, rollout order. Sourced from prior tmp.md scratch; cleared tmp.md.
<!-- meta end -->
