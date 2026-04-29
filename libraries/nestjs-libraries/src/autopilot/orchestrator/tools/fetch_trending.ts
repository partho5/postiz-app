/**
 * `fetch_trending` tool — slice E.7
 *
 * Finds trending topics relevant to the tenant's niche using Tavily web search.
 * Falls back to LLM-generated trend suggestions when AP_TAVILY_API_KEY is absent
 * or the request fails. Pure read — LLM narrates.
 *
 * Use when the user asks "what's trending in my niche?", "find trending topics",
 * "what's popular on LinkedIn right now?", "show me trending content ideas".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile } from '../../memory';
import { searchTavily } from '../../agents/researcher';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  niche: z
    .string()
    .optional()
    .describe(
      'Niche or industry to search trends for (e.g. "B2B SaaS", "fitness"). Defaults to the stored business profile niche.',
    ),
  platform: z
    .string()
    .optional()
    .describe(
      'Narrow to platform-specific trends (e.g. "linkedin", "twitter"). Omit for general.',
    ),
  count: z
    .number()
    .int()
    .min(3)
    .max(10)
    .optional()
    .describe('How many trending topics to return (3–10). Defaults to 5.'),
});

export type FetchTrendingInput = z.infer<typeof inputSchema>;

export interface TrendingTopic {
  topic: string;
  source: 'tavily' | 'llm';
  relevance?: string;
}

export interface FetchTrendingOutput {
  niche: string;
  topics: TrendingTopic[];
  source: 'tavily' | 'llm_fallback';
}

const fallbackSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      relevance: z.string().describe('One sentence on why this is relevant now.'),
    }),
  ),
});

export function createFetchTrendingTool(): OrchestratorTool<FetchTrendingInput, FetchTrendingOutput> {
  return {
    name: 'fetch_trending',
    description:
      'Find currently trending topics relevant to the account\'s niche using web search. Use for "what\'s trending?", "trending topics in my niche", "popular content ideas right now". Falls back to LLM suggestions when search is unavailable.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const count = input.count ?? 5;

      // Resolve niche from input or profile
      let niche = input.niche;
      if (!niche) {
        const profile = await getStructuredProfile(
          ctx.db as unknown as PrismaClient,
          ctx.org.id,
        );
        niche = profile?.businessProfile?.niche ?? 'general business';
      }

      const platformSuffix = input.platform ? ` on ${input.platform}` : '';
      const query = `trending topics ${niche}${platformSuffix} ${new Date().getFullYear()}`;

      let topics: TrendingTopic[];
      let dataSource: 'tavily' | 'llm_fallback';

      try {
        const findings = await searchTavily(query, 'basic', count);
        topics = findings.slice(0, count).map((f) => ({
          topic: f.title,
          source: 'tavily' as const,
          relevance: f.content.slice(0, 120),
        }));
        dataSource = 'tavily';
      } catch {
        // Tavily unavailable — fall back to LLM
        const { object } = await generateObject({
          model: ctx.llm.model,
          schema: fallbackSchema,
          prompt: [
            `Generate ${count} currently trending content topics for the niche: "${niche}"${platformSuffix}.`,
            `Base suggestions on plausible current trends as of ${new Date().toDateString()}.`,
            `Each topic should be specific and timely, not generic.`,
          ].join('\n'),
        });
        topics = object.topics.slice(0, count).map((t) => ({
          topic: t.topic,
          source: 'llm' as const,
          relevance: t.relevance,
        }));
        dataSource = 'llm_fallback';
      }

      const sourceNote =
        dataSource === 'llm_fallback'
          ? '\n_(Set AP_TAVILY_API_KEY for live web search results.)_'
          : '';

      const observation =
        `Trending topics for "${niche}"${platformSuffix}:\n` +
        topics.map((t, i) => `${i + 1}. **${t.topic}**${t.relevance ? `\n   ${t.relevance}` : ''}`).join('\n') +
        sourceNote;

      ctx.logger.info(`fetch_trending: org=${ctx.org.id} niche="${niche}" source=${dataSource}`);

      return { observation, data: { niche, topics, source: dataSource } };
    },
  };
}
