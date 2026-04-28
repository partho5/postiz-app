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
import { selectModel, DEFAULT_MODEL_PREFERENCE } from '../llm';

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

export interface DirectActionData {
  topics?: string[];
  content?: string;
  platforms?: string[];
  startTime?: string;
  immediate?: boolean;
  intervalMinutes?: number;
  wantsImage?: boolean;
  /** Per-topic times for pinned scheduling — same length as topics. */
  perPostTimes?: string[];
}

export interface IntentResult {
  intent: IntentClass;
  /** Only present when intent === 'config_change_request'. */
  draft?: DraftProposal;
  /** Only present when intent === 'direct_action'. */
  directAction?: DirectActionData;
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
    // ── config_change_request fields ──────────────────────────────────────
    targetEntity: z.string().optional(),
    targetId: z.string().nullable().optional(),
    changes: z.record(z.unknown()).optional(),
    rationale: z.string().optional(),
    // ── direct_action fields ──────────────────────────────────────────────
    /** What the posts should be about — array even for a single post. */
    topics: z.array(z.string()).optional(),
    /** Verbatim content if the user provided exact text to post. */
    content: z.string().optional(),
    /** Target platform names (e.g. ["facebook","linkedin"]). Omit if not specified. */
    platforms: z.array(z.string()).optional(),
    /** Natural-language or ISO time for the first (or only) post. Omit if not mentioned. */
    startTime: z.string().optional(),
    /** True ONLY when user says "now", "immediately", "right now", "asap". Never default to true. */
    immediate: z.boolean().optional(),
    /** Minutes between posts when scheduling a series (default 60). Omit if not a series. */
    intervalMinutes: z.number().int().optional(),
    /** True if user explicitly asked for an image. Omit if not mentioned. */
    wantsImage: z.boolean().optional(),
  })
  .describe('Intent classification result');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const INTENT_CLASSES = [
  'direct_action        — user wants to CREATE and publish NEW content (e.g. "post about X", "schedule a post"). NOT for delete, remove, cancel, edit, or manage existing posts.',
  'config_change_request — user wants to change a setting (e.g. "post more often on weekdays")',
  'question             — user is asking for information (e.g. "how many posts went out this week?")',
  'small_talk           — casual / off-topic (e.g. "thanks", "hello")',
  'unclear              — cannot be categorised, OR user wants to delete/cancel/edit/manage an existing post',
].join('\n  ');

const ENTITIES = [
  'business_profile        — fields: niche, goals, brandVoiceShort, brandVoiceExtended, antiPatterns, regulatoryFlags',
  'growth_rule             — fields: ruleKey, ruleValue, active',
  'cadence_config          — fields: postsPerDay, preferredTimes (array of HH:MM), timezone, active, pausedUntil. targetId = platform name (e.g. "linkedin") or null for global.',
  'tenant_strategy_optout  — field: optedOut (boolean). true = stop contributing anonymized strategy data; false = resume contributing. Singleton (targetId = null).',
].join('\n    ');

const BASE_SYSTEM_PROMPT = `\
You are an intent-classification assistant for a social-media autopilot product.

Given a user message, output a JSON object with:
  intent: one of:
  ${INTENT_CLASSES}

For intent = "direct_action" ALSO include these fields — but ONLY if explicitly stated in the CURRENT user message (after the --- separator). Do NOT inherit or infer them from earlier turns shown above the separator:
  topics         - array of topics the posts should be about. Always an array even for one post (e.g. ["the topic"] or ["word1","word2","word3"]). Omit if not mentioned.
  content        - verbatim post text if the user provided exact wording in the current message.
  platforms      - platforms the user named in the current message (e.g. ["facebook"]). Omit if not mentioned.
  startTime      - when the first (or only) post should go out, as stated in the current message. Pass the natural-language phrase verbatim (e.g. "next hour", "tomorrow 9am"). Omit if not mentioned.
  immediate      - true ONLY if the current message contains "now", "immediately", "right now", "asap". Never default to true. Omit otherwise.
  intervalMinutes - minutes between consecutive posts when the user asks for a series (e.g. "every hour" → 60, "every day" → 1440). Omit if not a series.
  wantsImage     - true only if the user explicitly asked for an image in the current message. Omit otherwise.

For intent = "config_change_request" ALSO include:
  targetEntity - the entity to mutate, one of:
    ${ENTITIES}
  targetId     - id of the existing record, or null (create or singleton)
  changes      - object whose keys are field names and values are the new values
  rationale    - one sentence in first person speaking directly to the user, describing what you are about to change and why. Example: "I'll set your posting frequency to daily to help grow your engagement." Do NOT refer to "the user" in third person.

Omit fields that do not apply to the detected intent.
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
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<IntentResult> {
  // Build classification prompt: include last 3 turns for context so the
  // classifier understands references like "as per the prompt earlier".
  const historyPrefix =
    recentHistory && recentHistory.length > 0
      ? '[PRIOR CONVERSATION — for intent context only. Do NOT extract direct_action fields from these turns.]\n' +
        recentHistory
          .slice(-3)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 400)}`)
          .join('\n') + '\n[END PRIOR CONVERSATION]\n---\n'
      : '';

  const classificationPrompt = historyPrefix
    ? `${historyPrefix}[CURRENT MESSAGE — classify this and extract direct_action fields from here only]\nUser: ${message}`
    : message;

  const system = buildSystemPrompt(tenantContext);

  // Try primary model first, then fall back through alternative available models.
  // This handles cases where the primary model fails structured output on complex input.
  const modelsToTry = [
    llm.model,
    ...DEFAULT_MODEL_PREFERENCE
      .filter((id) => id !== (llm.model as { modelId?: string }).modelId)
      .map((id) => selectModel([id]))
      .filter((m): m is NonNullable<typeof m> => m !== null),
  ];

  let object: z.infer<typeof intentResultSchema> | null = null;
  for (const model of modelsToTry) {
    try {
      ({ object } = await generateObject({
        model,
        schema: intentResultSchema,
        prompt: classificationPrompt,
        system,
      }));
      break;
    } catch {
      // Try next model.
    }
  }

  if (!object) {
    // All models failed — fall back to 'unclear' so the caller streams a normal text response.
    return { intent: 'unclear' };
  }

  const result: IntentResult = { intent: object.intent };

  if (object.intent === 'config_change_request') {
    result.draft = {
      targetEntity: object.targetEntity ?? 'business_profile',
      targetId: object.targetId ?? null,
      changes: (object.changes as Record<string, unknown>) ?? {},
      rationale: object.rationale ?? '',
    };
  }

  if (object.intent === 'direct_action') {
    result.directAction = {
      topics: object.topics,
      content: object.content,
      platforms: object.platforms,
      startTime: object.startTime,
      immediate: object.immediate,
      intervalMinutes: object.intervalMinutes,
      wantsImage: object.wantsImage,
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
