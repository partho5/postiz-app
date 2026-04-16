/**
 * Intent parser agent — slice 1.3
 *
 * Classifies a chat message into one of five intent buckets and, for
 * config_change_request, produces a draft proposal object (not persisted).
 *
 * Uses ai-v5 generateObject with a Zod schema to get structured output
 * from the LLM without hand-rolling JSON parsing.
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import type { AgentDefinition } from './types';
import type { LlmProvider } from '../skills/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntentClass =
  | 'direct_action'
  | 'config_change_request'
  | 'question'
  | 'small_talk'
  | 'unclear';

/**
 * A draft proposal produced when the intent is config_change_request.
 * Not persisted here — the confirm pipeline (slice 1.4) handles persistence.
 */
export interface DraftProposal {
  /** DB entity to mutate (e.g. 'business_profile', 'growth_rule'). */
  targetEntity: string;
  /** Id of the specific row, or null when creating / entity is a singleton. */
  targetId: string | null;
  /** Field-keyed map of the proposed new values. */
  changes: Record<string, unknown>;
  /** One-sentence justification shown to the user in the confirm UX. */
  rationale: string;
}

export interface IntentResult {
  intent: IntentClass;
  /** Only present when intent === 'config_change_request'. */
  draft?: DraftProposal;
}

export interface IntentParserInput {
  message: string;
  tenantContext?: {
    niche?: string;
    goals?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Zod schema for structured LLM output
// ---------------------------------------------------------------------------

const intentResultSchema = z
  .object({
    intent: z.enum([
      'direct_action',
      'config_change_request',
      'question',
      'small_talk',
      'unclear',
    ]),
    /**
     * Only populated by the LLM when intent = 'config_change_request'.
     * All fields optional so non-config intents don't need to emit them.
     */
    targetEntity: z.string().optional(),
    targetId: z.string().nullable().optional(),
    changes: z.record(z.unknown()).optional(),
    rationale: z.string().optional(),
  })
  .describe('Intent classification result');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const INTENT_CLASSES = [
  'direct_action        — user wants the system to act right now (e.g. "post this to Twitter")',
  'config_change_request — user wants to change a setting (e.g. "post more often on weekdays")',
  'question             — user is asking for information (e.g. "how many posts went out this week?")',
  'small_talk           — casual / off-topic (e.g. "thanks", "hello")',
  'unclear              — cannot be categorised',
].join('\n  ');

const ENTITIES = [
  'business_profile — fields: niche, goals, brandVoiceShort, brandVoiceExtended, antiPatterns, regulatoryFlags',
  'growth_rule      — fields: ruleKey, ruleValue, active',
].join('\n    ');

const BASE_SYSTEM_PROMPT = `\
You are an intent-classification assistant for a social-media autopilot product.

Given a user message, output a JSON object with:
  intent: one of —
  ${INTENT_CLASSES}

For intent = "config_change_request" ALSO include:
  targetEntity — the entity to mutate, one of:
    ${ENTITIES}
  targetId     — id of the existing record, or null (create / singleton)
  changes      — object whose keys are field names and values are the new values
  rationale    — one sentence explaining why this change is proposed

For all other intents omit targetEntity, targetId, changes, and rationale.
Respond ONLY with the JSON object — no prose.`;

function buildSystemPrompt(
  tenantContext?: { niche?: string; goals?: unknown },
): string {
  if (!tenantContext) return BASE_SYSTEM_PROMPT;

  const lines: string[] = [];
  if (tenantContext.niche) lines.push(`Business niche: ${tenantContext.niche}`);
  if (tenantContext.goals)
    lines.push(`Goals: ${JSON.stringify(tenantContext.goals)}`);

  return lines.length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nTenant context:\n${lines.join('\n')}`
    : BASE_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// parseIntent — main entry point
// ---------------------------------------------------------------------------

/**
 * Classify `message` using the LLM and return an IntentResult.
 *
 * For config_change_request the `draft` field is populated with the
 * proposed changes.  The caller (chat ingress) decides when and whether to
 * persist the draft via createProposal() from the slice 1.4 pipeline.
 *
 * Throws when the LLM call itself fails (network, key missing, etc.).
 */
export async function parseIntent(
  message: string,
  llm: LlmProvider,
  tenantContext?: { niche?: string; goals?: unknown },
): Promise<IntentResult> {
  const { object } = await generateObject({
    model: llm.model,
    schema: intentResultSchema,
    prompt: message,
    system: buildSystemPrompt(tenantContext),
  });

  const result: IntentResult = { intent: object.intent };

  if (object.intent === 'config_change_request') {
    result.draft = {
      targetEntity: object.targetEntity ?? 'business_profile',
      targetId: object.targetId ?? null,
      changes: (object.changes as Record<string, unknown>) ?? {},
      rationale: object.rationale ?? '',
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// AgentDefinition — for integration with the agent registry
// ---------------------------------------------------------------------------

export const intentParserAgent: AgentDefinition<IntentParserInput, IntentResult> = {
  id: 'intent_parser',
  systemPrompt: BASE_SYSTEM_PROMPT,
  allowedSkills: [],
  run: async (ctx, input) =>
    parseIntent(input.message, ctx.llm, input.tenantContext),
};

export default intentParserAgent;
