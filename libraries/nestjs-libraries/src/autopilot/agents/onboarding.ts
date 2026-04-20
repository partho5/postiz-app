/**
 * Onboarding agent — slice 1.12
 *
 * Guides a new tenant through providing business profile information
 * via a multi-turn conversational flow.  Two-step logic:
 *
 *   1. analyzeOnboarding()  — uses generateObject to inspect the conversation
 *      history and decide whether enough info has been gathered to propose a
 *      business profile or whether another question is needed.
 *
 *   2. The caller (chat.service) either:
 *      a) Creates a proposal (action = 'propose') via the existing confirm
 *         pipeline (proposals.ts → applier → ApBusinessProfile upsert).
 *      b) Streams a follow-up question (action = 'ask') with a targeted
 *         system prompt built by buildOnboardingReplyPrompt().
 *
 * The agent never persists anything itself — all writes go through the
 * existing proposal and chat-message pipelines in the chat service.
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import type { LanguageModel } from 'ai-v5';
import type { AgentDefinition } from './types';
import type { DraftProposal } from './intent_parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type OnboardingResult =
  | { action: 'ask'; topic: string }
  | { action: 'propose'; draft: DraftProposal };

// ---------------------------------------------------------------------------
// Zod schema for the LLM decision
// ---------------------------------------------------------------------------

const onboardingDecisionSchema = z.object({
  ready: z
    .boolean()
    .describe(
      'true when the conversation contains enough information to propose a business profile',
    ),
  nextTopic: z
    .string()
    .optional()
    .describe(
      'Topic to ask about next when ready=false (e.g. "niche", "goals", "brand_voice")',
    ),
  profile: z
    .object({
      niche: z.string().describe('The business niche or industry'),
      goals: z
        .array(z.string())
        .default([])
        .describe('Business or growth goals'),
      brandVoiceShort: z
        .string()
        .describe('Short brand voice description (1-2 sentences)'),
      brandVoiceExtended: z
        .string()
        .default('')
        .describe('Extended brand voice guidelines'),
    })
    .optional()
    .describe('Extracted profile data — only required when ready=true'),
});

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const DECISION_SYSTEM_PROMPT = `\
You are analyzing a conversation between a user and an AI social-media autopilot during onboarding.

Determine if the conversation contains enough information to create a business profile.

A complete profile needs at minimum:
  - niche: what industry / niche the business is in
  - goals: at least one business or growth goal
  - brandVoiceShort: a brief description of the brand's communication style

Review the FULL conversation history and the latest message.  Information may
be spread across multiple messages — aggregate it.

If enough info exists, set ready=true and extract the profile fields.
If not, set ready=false and set nextTopic to the first missing topic:
  "niche" → "goals" → "brand_voice" (in that order).

Be reasonable: if the user has given enough context to infer a sensible default
for a field, count it as provided.  For example, if a user says "I run a SaaS
startup" you can infer niche="SaaS" without them spelling it out.

Respond ONLY with the JSON object — no prose.`;

// ---------------------------------------------------------------------------
// analyzeOnboarding
// ---------------------------------------------------------------------------

/**
 * Inspect conversation history + latest message and decide whether to ask
 * another question or produce a business-profile proposal.
 */
export async function analyzeOnboarding(
  model: LanguageModel,
  history: OnboardingTurn[],
  latestMessage: string,
): Promise<OnboardingResult> {
  const conversationLines = history.map(
    (t) => `${t.role}: ${t.content}`,
  );

  const prompt = conversationLines.length > 0
    ? `Conversation so far:\n${conversationLines.join('\n')}\n\nLatest user message:\n${latestMessage}`
    : `This is the user's first message:\n${latestMessage}`;

  const { object } = await generateObject({
    model,
    schema: onboardingDecisionSchema,
    prompt,
    system: DECISION_SYSTEM_PROMPT,
  });

  if (object.ready && object.profile) {
    const { niche, goals, brandVoiceShort, brandVoiceExtended } =
      object.profile;

    return {
      action: 'propose',
      draft: {
        targetEntity: 'business_profile',
        targetId: null,
        changes: {
          niche,
          goals,
          brandVoiceShort,
          ...(brandVoiceExtended ? { brandVoiceExtended } : {}),
        },
        rationale: `Based on our conversation, I've put together your business profile: you're in the "${niche}" space with a "${brandVoiceShort}" brand voice.`,
      },
    };
  }

  return {
    action: 'ask',
    topic: object.nextTopic ?? 'niche',
  };
}

// ---------------------------------------------------------------------------
// buildOnboardingReplyPrompt
// ---------------------------------------------------------------------------

/**
 * Build a system prompt for the streamed follow-up question.
 * `topic` indicates what the agent should ask about next.
 */
export function buildOnboardingReplyPrompt(
  topic: string,
  history: OnboardingTurn[],
): string {
  const hasHistory = history.length > 0;

  const topicDescriptions: Record<string, string> = {
    niche:
      'what their business or brand does — the industry, niche, or space they operate in',
    goals:
      'what they want to achieve on social media (growth, engagement, brand awareness, lead generation, etc.)',
    brand_voice:
      'how they want their brand to sound on social media (professional, casual, witty, inspirational, etc.)',
  };

  const topicDesc =
    topicDescriptions[topic] ?? `their ${topic.replace(/_/g, ' ')}`;

  return `\
You are a friendly AI assistant helping a new user set up their social media autopilot.
${hasHistory ? 'Continue the onboarding conversation naturally.' : 'This is the start of the conversation. Welcome the user warmly and briefly.'}

Your next goal is to learn about ${topicDesc}.

Guidelines:
- Be concise and conversational (2-3 sentences max).
- Ask ONE focused question at a time.
- Acknowledge what the user has already shared before asking the next question.
- Do not list all the questions you plan to ask.
- Do not reveal internal topic names or onboarding steps.`;
}

// ---------------------------------------------------------------------------
// AgentDefinition — for integration with the agent registry
// ---------------------------------------------------------------------------

export const onboardingAgent: AgentDefinition<
  { history: OnboardingTurn[]; latestMessage: string },
  OnboardingResult
> = {
  id: 'onboarding',
  systemPrompt: DECISION_SYSTEM_PROMPT,
  allowedSkills: [],
  run: async (ctx, input) =>
    analyzeOnboarding(ctx.llm.model, input.history, input.latestMessage),
};

export default onboardingAgent;
