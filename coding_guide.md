# Coding Guide — AI Social Media Autopilot

> **This is not the project plan.** The product scope lives in [project_plan.md](project_plan.md). This file is the **execution map** for Claude Code: modular slices, status tracking, and repo hints so work can resume without re-reading the codebase.

---

## How to use this file

**Every Claude Code session follows the same loop:**

1. Read this file top to bottom (it is the only file that needs re-reading each session).
2. Check §Status tracker → pick the next unchecked slice (or the one the user named).
3. Read §Architecture cheat sheet for paths/conventions — do **not** re-explore the repo if the answer is here.
4. Read the slice definition. If it cites sections of `project_plan.md`, read only those sections.
5. Execute the slice. Do **only** that slice.
6. Update this file (see §Self-tracking protocol).
7. Stop. Hand back to the user.

## Principles for Claude Code

- **One slice per session.** Never bundle slices. If a slice finishes fast and the user says "keep going," treat the next slice as a new session: update tracker, re-read the next slice definition, then proceed.
- **Do not refactor adjacent code** unless the slice explicitly calls for it.
- **Do not add features beyond the slice's "Definition of done."**
- **If a slice is ambiguous, stop and ask.** Do not infer.
- **If a dependency is unmet,** do not do the dependency — stop and tell the user which slice must run first.
- **If you discover a blocker** (missing library, broken build, architectural mismatch), record it in §Blockers and stop.
- **If you learn something reusable** about the repo (paths, conventions, existing helpers), append it to §Architecture cheat sheet so the next session doesn't re-derive it.
- **Keep the build green.** Run typecheck/tests for touched packages when feasible. If setup is unclear, do the minimum smoke check.
- **Never mark a slice done unless its Definition of done is met.** If partially done, leave unchecked, write what's complete in §Build log, and describe remaining work in §Carry-over.

## Self-tracking protocol

After completing a slice, update **exactly these sections** of this file before finishing:

1. **§Status tracker** — check the box for the completed slice.
2. **§Build log** — append one line: `YYYY-MM-DD | slice-id | outcome | files-touched`. Keep it dense.
3. **§Architecture cheat sheet** — add any repo path, helper, convention, or gotcha worth preserving. Prefer updating existing entries over adding new ones.
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
- [ ] 0.5 — `skill-costs.ts` scaffold
- [ ] 0.6 — Agent base types (system prompt, scoped skills, ctx)
- [ ] 0.7 — Prisma: `credit_ledger` + migration
- [ ] 0.8 — Prisma: `activity_log` + migration
- [ ] 0.9 — Prisma: `capability_gaps` + migration
- [ ] 0.10 — Prisma: `chat_messages` + migration
- [ ] 0.11 — Encryption utility for per-tenant secrets
- [ ] 0.12 — Prisma: `platform_keys` + CRUD service
- [ ] 0.13 — Pre-flight pipeline skeleton (plan gate → credit gate → dispatch)
- [ ] 0.14 — Activity logger helper + credit debit helper
- [ ] 0.15 — Capability gap logger helper
- [ ] 0.16 — Vercel AI SDK wiring + provider selection helper
- [ ] 0.17 — Prisma: `discounts` + `discount_applications` + migration
- [ ] 0.18 — Discount module (origin-agnostic apply/list/validate)
- [ ] 0.19 — PayPal webhook endpoint scaffolding (signature verify, no-op handlers)
- [ ] 0.20 — Prisma: `subscriptions` + `invoices` + migration

### Phase 1 — Chat Core
- [ ] 1.1 — Prisma: `business_profile`, `growth_rules` + migration
- [ ] 1.2 — Prisma: `config_change_proposals` + migration
- [ ] 1.3 — Intent parser agent skeleton (classify + propose, no CRUD)
- [ ] 1.4 — Proposal → confirm → apply pipeline
- [ ] 1.5 — Enable `pgvector` extension + `memory_vectors` table + migration
- [ ] 1.6 — Memory read/write service (structured + vector)
- [ ] 1.7 — Memorist agent skeleton
- [ ] 1.8 — Chat ingress endpoint (web source), writes `chat_messages`, routes to intent parser
- [ ] 1.9 — Frontend: chatbot-primary layout scaffold (no agent wiring yet)
- [ ] 1.10 — Frontend: card-select component for confirm UX
- [ ] 1.11 — Frontend: wire chat UI to ingress endpoint (streamed response)
- [ ] 1.12 — Onboarding first-run: seed `business_profile` via chat intent parser

### Phase 2 — Stack + Scheduler
- [ ] 2.1 — Prisma: `post_candidates` + migration
- [ ] 2.2 — Stack primitives: push, pop_top, expire, depth
- [ ] 2.3 — Prisma: `cadence_config` + migration
- [ ] 2.4 — Prisma: `scheduled_slots` + migration
- [ ] 2.5 — Slot scheduler cron (materialize next-N slots)
- [ ] 2.6 — Pop-and-publish integration with Postiz publisher
- [ ] 2.7 — Prisma: `published_posts` + migration (joins to candidates)
- [ ] 2.8 — Stock keeper agent skeleton
- [ ] 2.9 — Stale candidate sweeper cron
- [ ] 2.10 — Stack depth enforcement (minimum N, never empty)
- [ ] 2.11 — Evergreen fallback pool seed + retrieval
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

### Non-obvious gotchas (append as discovered)
- **No Prisma migrations** — Postiz uses `prisma db push` exclusively. When slice definitions say "migration generated/applied," interpret as: add model to `schema.prisma`, run `pnpm prisma-db-push`, regenerate client with `pnpm prisma-generate`.
- **No `@@map` anywhere in schema** — Postiz table names in Postgres match the PascalCase model name exactly (Prisma default). Our `ap_` prefix must be set via `@@map("ap_credit_ledger")` etc.
- **`credits` table already exists** in Postiz (model `Credits`, tracks AI image credits). Our ledger table MUST use `@@map("ap_credit_ledger")` to avoid collision; do not reuse Postiz's Credits table.
- **`subscriptions` table already exists** in Postiz (model `Subscription`). Our autopilot subscription table must be `@@map("ap_subscriptions")`.
- **Env validation is non-fatal warnings** by default — `ConfigurationChecker` only logs, does not throw. To make `AP_ENCRYPTION_KEY` fail-fast, add a throw inside `check()` when autopilot module is enabled.
- **Module pattern**: Most shared backend logic lives in `libraries/nestjs-libraries/src/`, not `apps/backend/src/`. Put autopilot services/repositories in `libraries/nestjs-libraries/src/autopilot/` and expose via an `AutopilotModule` imported in `app.module.ts`.
- **Root path alias for our new code**: `@gitroom/autopilot/*` → `libraries/nestjs-libraries/src/autopilot/*` (added to `tsconfig.base.json` in slice 0.2). Use `@gitroom/autopilot/skills`, `@gitroom/autopilot/agents`, etc. to import from autopilot subdirectories.

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
