/**
 * Orchestrator type contract — slice 1.3.b
 *
 * The orchestrator agent (slice 1.3.c) consumes a registry of
 * `OrchestratorTool`s. Each tool advertises a Zod schema for its input
 * and a handler that receives an `OrchestratorContext` and produces an
 * `OrchestratorToolResult`.  Tool handlers may also push side-events
 * (cards, lists, confirmations) to the chat stream via `ctx.emit`.
 *
 * No runtime behaviour lives here — only types. The actual dispatch
 * loop and tool implementations land in 1.3.c+.
 */

import type { Organization, User } from '@prisma/client';
import type { z } from 'zod';
import type { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import type { LlmProvider } from '../skills/types';
import type { ChatStreamEvent } from '../chat/chat.service';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/** Same shape as SkillLogger / NestJS LoggerService. Re-declared to avoid coupling. */
export interface OrchestratorLogger {
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}

// ---------------------------------------------------------------------------
// OrchestratorContext
// ---------------------------------------------------------------------------

/**
 * Runtime context passed into every orchestrator tool handler.
 *
 * - `org`/`user` mirror the auth-middleware request fields.
 * - `db` is the Postiz PrismaService (extends PrismaClient).
 * - `llm` is the same provider abstraction skills/agents use.
 * - `emit` lets the tool push UI side-events (`scheduled_list`,
 *   `analytics_card`, `confirm`, `action_result`, `text`, etc.) without
 *   waiting for the orchestrator's final text turn.
 * - `now` and `timezone` are the source-of-truth for time-aware tools
 *   (passed to `parseTimeExpression` and `formatForUser`).
 */
export interface OrchestratorContext {
  org: Organization;
  user: User;
  db: PrismaService;
  llm: LlmProvider;
  emit: (event: ChatStreamEvent) => void;
  now: Date;
  /** IANA timezone (e.g. "America/New_York"). */
  timezone: string;
  logger: OrchestratorLogger;
}

// ---------------------------------------------------------------------------
// OrchestratorToolResult
// ---------------------------------------------------------------------------

/**
 * What a tool returns to the orchestrator on completion.
 *
 * - `observation` is the string the LLM sees on the next reasoning step
 *   (think: tool-call `observation` in ReAct). Keep it concise; this is
 *   what the LLM uses to decide its next move or compose its final reply.
 * - `data`        is structured payload, opaque to the LLM, available to
 *   downstream code that bypasses the LLM (e.g. unit tests, telemetry).
 * - `emitted`      flags that the tool already pushed a UI side-event
 *   via `ctx.emit`.
 * - `suppressText`  controls whether the orchestrator suppresses its LLM
 *   prose when `emitted` is true. Defaults to `true` (suppress). Set to
 *   `false` when the emitted card may be empty (e.g. a zero-result list)
 *   so the LLM can still narrate in human voice.
 */
export interface OrchestratorToolResult<Output = unknown> {
  observation: string;
  data?: Output;
  emitted?: boolean;
  /** When false, orchestrator prose is NOT suppressed even if emitted=true. */
  suppressText?: boolean;
}

// ---------------------------------------------------------------------------
// OrchestratorTool
// ---------------------------------------------------------------------------

/**
 * The shape every tool file exports.  One file per tool; each file
 * default-exports an `OrchestratorTool`.  Mirrors the conventions used
 * for skills (slice 0.3) and agents (slice 0.6).
 *
 * - `name`        is the LLM-visible identifier (snake_case).
 * - `description` is the LLM-visible blurb that drives tool selection.
 *   Keep it action-oriented and unambiguous.
 * - `parameters`  is a Zod schema describing the tool's input. The
 *   orchestrator passes this to the Vercel AI SDK `tool()` helper, which
 *   validates the LLM's tool-call arguments before invoking `handler`.
 */
export interface OrchestratorTool<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<Input>;
  handler: (
    ctx: OrchestratorContext,
    input: Input,
  ) => Promise<OrchestratorToolResult<Output>>;
}

// ---------------------------------------------------------------------------
// New SSE event types — to be unioned into ChatStreamEvent
// ---------------------------------------------------------------------------

/** A list of upcoming scheduled posts, returned by `list_scheduled_posts`. */
export type ChatScheduledListEvent = {
  type: 'scheduled_list';
  posts: Array<{
    id: string;
    platform: string;
    content: string;
    /** ISO 8601 UTC. */
    scheduledAt: string;
    /** Mirrors ApScheduledSlotStatus. */
    status: string;
  }>;
};

/** Per-platform analytics summary card, returned by `analytics_snapshot`. */
export type ChatAnalyticsCardEvent = {
  type: 'analytics_card';
  platform: string;
  periodDays: number;
  metrics: Array<{
    label: string;
    value: number | string;
    /** Optional comparison signal vs. the prior period. */
    trend?: 'up' | 'down' | 'flat';
  }>;
  /** ISO 8601 UTC. */
  capturedAt: string;
};

/**
 * A confirmation prompt for a destructive or hard-to-reverse action
 * (cancel a scheduled post, rollback a published post, etc.).
 *
 * The frontend renders Confirm / Cancel buttons; clicking Confirm hits a
 * dedicated backend endpoint keyed by `confirmId`. The endpoint itself
 * is added in slice 1.3.d alongside the management tools.
 */
export type ChatConfirmEvent = {
  type: 'confirm';
  /** Opaque token; the backend pairs this with the pending action. */
  confirmId: string;
  /** Stable action key (e.g. "cancel_scheduled_post"). */
  action: string;
  /** Human-readable description shown above the buttons. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * Generic success/failure receipt for an action that just executed.
 * Used for short confirmations like "Cancelled — won't post Friday."
 */
export type ChatActionResultEvent = {
  type: 'action_result';
  /** Stable action key; pairs with prior `confirm` event. */
  action: string;
  ok: boolean;
  message: string;
};

// ---------------------------------------------------------------------------
// Placeholder tool registry
// ---------------------------------------------------------------------------

/**
 * The orchestrator looks up tools from this registry. Empty in 1.3.b;
 * 1.3.c adds the starter four (schedule_post, list_scheduled_posts,
 * cancel_pending_draft, clarify_with_user).
 */
export const ORCHESTRATOR_TOOLS: OrchestratorTool<unknown, unknown>[] = [];

// ---------------------------------------------------------------------------
// Compile-time smoke check — mirrors the pattern used in agents/types.ts
// ---------------------------------------------------------------------------

import { z as _z } from 'zod';

const _stubSchema = _z.object({ ok: _z.boolean() });
type _StubInput = _z.infer<typeof _stubSchema>;

const _stub: OrchestratorTool<_StubInput, { echoed: boolean }> = {
  name: 'stub',
  description: 'Compile-time smoke-check tool. Never registered.',
  parameters: _stubSchema,
  handler: async (_ctx, input) => ({
    observation: input.ok ? 'ok' : 'not ok',
    data: { echoed: input.ok },
  }),
};

void _stub;
