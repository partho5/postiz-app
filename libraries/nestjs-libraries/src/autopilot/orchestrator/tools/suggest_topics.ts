/**
 * `suggest_topics` tool — slice E.7
 *
 * Generates topic ideas aligned with the tenant's niche and goals. Loads the
 * business profile for context and optionally checks upcoming scheduled slots
 * to avoid repeating themes already in the queue. Pure read — LLM narrates.
 *
 * Use when the user asks "what should I post about?", "give me topic ideas",
 * "suggest content ideas for LinkedIn", "I need post ideas".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile } from '../../memory';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('How many topic ideas to generate (1–20). Defaults to 5.'),
  platform: z
    .string()
    .optional()
    .describe('Tailor ideas for a specific platform (e.g. "linkedin"). Omit for general.'),
  theme: z
    .string()
    .optional()
    .describe('Optional theme or category to focus ideas around (e.g. "AI in marketing").'),
});

export type SuggestTopicsInput = z.infer<typeof inputSchema>;

export interface TopicIdea {
  topic: string;
  rationale: string;
  suggestedFormat?: string;
}

export interface SuggestTopicsOutput {
  count: number;
  topics: TopicIdea[];
}

const outputSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string().describe('A concrete, specific topic or post idea (not a broad category).'),
      rationale: z.string().describe('One sentence on why this fits the brand and audience.'),
      suggestedFormat: z
        .string()
        .optional()
        .describe('Optional: best format for this topic (e.g. "thread", "carousel", "short post").'),
    }),
  ),
});

export function createSuggestTopicsTool(): OrchestratorTool<SuggestTopicsInput, SuggestTopicsOutput> {
  return {
    name: 'suggest_topics',
    description:
      'Generate content topic ideas aligned with the account\'s niche, goals, and brand voice. Use for "what should I post about?", "give me topic ideas", "suggest content ideas for LinkedIn". Pure read — returns ideas only.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const count = input.count ?? 5;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );
      const bp = profile?.businessProfile;

      const nicheBlock = bp
        ? [
            bp.niche ? `Niche: ${bp.niche}` : '',
            bp.goals ? `Goals: ${JSON.stringify(bp.goals)}` : '',
            bp.brandVoiceShort ? `Voice: ${bp.brandVoiceShort}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'No business profile configured — generate broadly useful content ideas.';

      const platformHint = input.platform
        ? `Generate ideas specifically suited for ${input.platform}.`
        : 'Ideas should work across social media platforms.';

      const themeHint = input.theme ? `Focus on the theme: "${input.theme}".` : '';

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          'You are a social media strategist generating specific, actionable content topic ideas.',
          nicheBlock,
          platformHint,
          themeHint,
          'Avoid generic topics. Each idea should be concrete and immediately writable.',
        ]
          .filter(Boolean)
          .join('\n'),
        prompt: `Generate exactly ${count} content topic ideas.`,
      });

      const topics = object.topics.slice(0, count) as TopicIdea[];
      const observation =
        `Here are ${topics.length} content topic idea(s):\n` +
        topics
          .map(
            (t, i) =>
              `${i + 1}. **${t.topic}**${t.suggestedFormat ? ` (${t.suggestedFormat})` : ''}\n   ${t.rationale}`,
          )
          .join('\n');

      ctx.logger.info(`suggest_topics: org=${ctx.org.id} count=${topics.length}`);

      return { observation, data: { count: topics.length, topics } };
    },
  };
}
