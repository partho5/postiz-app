/**
 * Orchestrator agent — slice 1.3.c (the bug-fix slice)
 *
 * Replaces the `intent_parser → branching` pipeline that lives inside
 * `chat.service.ts`'s "normal flow" with a single LLM-driven dispatch
 * loop. The model sees:
 *
 *   - the per-turn state snapshot (from `orchestrator/state-snapshot.ts`)
 *   - the recent chat history
 *   - the user's current message
 *   - the registry of tools (from `orchestrator/tools/index.ts`)
 *
 * It then either
 *   (a) calls one or more tools — each tool's structured `observation`
 *       string is fed back as the next reasoning step, OR
 *   (b) produces a plain assistant reply when no tool is appropriate.
 *
 * `stopWhen: stepCountIs(MAX_STEPS)` caps the inner ReAct loop so a
 * misbehaving model can't burn budget. Tools that emit UI side events
 * mark `emitted: true` so we know not to re-stream the same content as
 * a final text chunk.
 */

import { generateText, stepCountIs, tool, type Tool } from 'ai-v5';
import type { Organization, User } from '@prisma/client';
import type { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import type { LlmProvider } from '../skills/types';
import type { ChatStreamEvent } from '../chat/chat.service';
import type {
  OrchestratorContext,
  OrchestratorLogger,
  OrchestratorTool,
  OrchestratorToolResult,
} from '../orchestrator';
import {
  buildStateSnapshot,
  formatStateSnapshot,
} from '../orchestrator/state-snapshot';
import {
  buildOrchestratorTools,
  type OrchestratorToolDeps,
} from '../orchestrator/tools';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * Hard ceiling on tool-call rounds inside one user turn. Eight covers
 * complex multi-tool flows (e.g. list → cancel → reschedule → confirm)
 * without letting a misbehaving model burn budget.
 */
export const ORCHESTRATOR_MAX_STEPS = 8;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrchestratorRunInput {
  /** The current user message (already persisted to ap_chat_message). */
  message: string;
  /** Prior chat turns, oldest-first. Should NOT include the current message. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Tenant context surfaced from getStructuredProfile + opt-out lookup. */
  tenantCtx?: {
    niche?: string;
    goals?: unknown;
    strategyOptout?: boolean;
  };
}

export interface OrchestratorRunOutput {
  /** Final assistant text. Empty when a tool already emitted the reply (e.g. draft_preview). */
  text: string;
  /** Number of tool-call rounds the model executed. */
  toolCallCount: number;
  /** Names of tools called (in order). */
  toolsUsed: string[];
}

export interface OrchestratorRunDependencies extends OrchestratorToolDeps {
  /** Resolved by the chat service from req.org. */
  org: Organization;
  /** Resolved by the chat service from req.user. */
  user: User;
  db: PrismaService;
  llm: LlmProvider;
  emit: (event: ChatStreamEvent) => void;
  /** Defaults to `new Date()` when omitted; injected for deterministic tests. */
  now?: Date;
  /** Defaults to "UTC" when omitted. */
  timezone?: string;
  logger: OrchestratorLogger;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ROLE_AND_STYLE = `\
You are a sharp, experienced social media manager working inside an autopilot product.
Tone: confident, direct, brief. No filler ("Great!", "Certainly!", "I'd be happy to…", "Of course!").
Answer in one or two sentences when text is needed. Do not narrate what you're about to do.

You have tools. Prefer calling a tool over asking the user — if the user named a topic and a time, schedule the post; do not "confirm" by asking again.

RULES:
1. If a multi-turn post-creation flow is already pending (see <state> below), the user's next message is almost certainly answering it. Call schedule_post with the NEW info only — it MERGES automatically with what was already collected.
2. Do not call schedule_post and clarify_with_user in the same turn. Pick one.
3. If the user clearly abandons the current draft ("cancel", "never mind", "forget it") OR pivots to a brand-new request while a draft is pending, call cancel_pending_draft first.
4. For "what's scheduled", "show my queue", "list upcoming" → call list_scheduled_posts.
5. After schedule_post emits a draft_preview, your turn is OVER. Do NOT call further tools and do NOT add a text reply — the preview is the reply.
6. Time expressions (e.g. "after 5 minutes", "tomorrow 9am", "next hour") go to schedule_post as the \`startTime\` argument verbatim. Do NOT pre-convert to ISO yourself. The tool resolves them deterministically.
7. If the user asks what you can do, what your capabilities are, whether a feature exists, or how any feature works → call search_knowledge first. Do NOT answer from general knowledge — the knowledge base is the authoritative source. If search_knowledge returns no results, say you are not sure rather than guessing.

ARRAY-FIRST RULES — read carefully, these are critical:
8. schedule_post ALWAYS takes \`topics: string[]\` — even for a single post. NEVER use a scalar topic.
   • One post:   topics: ["my topic"]
   • Series of 7 posts spaced 60 min apart:
       topics: ["topic1","topic2","topic3","topic4","topic5","topic6","topic7"],
       startTime: "next hour", intervalMinutes: 60
   • There is NO create_post_series tool. schedule_post handles every count.
9. cancel_scheduled_post takes \`slotIds: string[]\`. Pass ALL ids in one call: slotIds: ["id1","id2","id3"]. Never call it in a loop.
10. reschedule_post takes \`slotIds: string[]\` and \`times: string[]\` as PARALLEL arrays of EQUAL length. slotIds[i] is rescheduled to times[i]. They MUST be the same length — validate before calling.
11. pause_posting takes \`platforms: string[]\`. Omit to pause ALL connected platforms.
12. resume_posting takes \`platforms: string[]\`. Omit to resume ALL currently-paused platforms.`;

/**
 * Compose the full system prompt: role + style + state-snapshot fence.
 * Tool descriptions are injected automatically by `generateText` from the
 * tool registry — we don't list them here.
 */
export function buildSystemPrompt(stateBlock: string): string {
  return `${ROLE_AND_STYLE}\n\n<state>\n${stateBlock}\n</state>`;
}

// ---------------------------------------------------------------------------
// Tool adapter
// ---------------------------------------------------------------------------

/**
 * Convert our `OrchestratorTool<I,O>` registry into the record-shape
 * `generateText({ tools: ... })` expects.  Each tool's structured
 * observation is what the LLM sees as the tool result — the `data`
 * payload is kept in the closure so callers can post-mortem inspect.
 */
export function adaptToolsForAiSdk(
  ctx: OrchestratorContext,
  registry: OrchestratorTool<unknown, unknown>[],
  /** Mutable trace; appended in order of tool calls. */
  trace: { name: string; result: OrchestratorToolResult<unknown> }[],
): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const t of registry) {
    out[t.name] = tool<unknown, string>({
      description: t.description,
      inputSchema: t.parameters,
      execute: async (input: unknown) => {
        const result = await t.handler(ctx, input);
        trace.push({ name: t.name, result });
        return result.observation;
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// runOrchestrator — main entry
// ---------------------------------------------------------------------------

/**
 * Run one orchestrator turn end-to-end. The function:
 *   1. Builds the state snapshot from prisma.
 *   2. Composes the system prompt.
 *   3. Calls `generateText` with the tool registry and recent history.
 *   4. Emits any final assistant text — but ONLY if no tool already
 *      pushed an output event (otherwise we'd echo "draft_preview" twice).
 *
 * Throws only when the LLM call itself fails. Tool-execution errors are
 * captured by `generateText` and surfaced to the model as observations.
 */
export async function runOrchestrator(
  deps: OrchestratorRunDependencies,
  input: OrchestratorRunInput,
): Promise<OrchestratorRunOutput> {
  const now = deps.now ?? new Date();
  const timezone = deps.timezone ?? 'UTC';

  const ctx: OrchestratorContext = {
    org: deps.org,
    user: deps.user,
    db: deps.db,
    llm: deps.llm,
    emit: deps.emit,
    now,
    timezone,
    logger: deps.logger,
  };

  // 1. State snapshot.
  const snapshot = await buildStateSnapshot(deps.db, {
    organizationId: deps.org.id,
    now,
    timezone,
    tenantCtx: input.tenantCtx,
  });
  const stateBlock = formatStateSnapshot(snapshot);
  const system = buildSystemPrompt(stateBlock);

  // 2. Tools.
  const registry = buildOrchestratorTools({
    directAction: deps.directAction,
    cadenceConfig: deps.cadenceConfig,
  });
  const trace: { name: string; result: OrchestratorToolResult<unknown> }[] = [];
  const tools = adaptToolsForAiSdk(ctx, registry, trace);

  // 3. Messages.
  const messages = [
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: input.message },
  ];

  // 4. Generate.
  const result = await generateText({
    model: deps.llm.model,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(ORCHESTRATOR_MAX_STEPS),
  });

  // 5. Decide what to emit as the assistant's "final text".
  // Suppress the final text when ANY tool already pushed an output event
  // — otherwise the user sees "Drafting your post…" + the draft_preview
  // card + a model-authored echo of the same.
  const anyToolEmitted = trace.some((t) => t.result.emitted === true);
  const finalText = result.text?.trim() ?? '';

  if (finalText && !anyToolEmitted) {
    deps.emit({ type: 'text', chunk: finalText });
  }

  return {
    text: anyToolEmitted ? '' : finalText,
    toolCallCount: trace.length,
    toolsUsed: trace.map((t) => t.name),
  };
}
