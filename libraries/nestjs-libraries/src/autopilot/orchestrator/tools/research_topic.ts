/**
 * `research_topic` tool — slice 1.3.e
 *
 * Bridges the researcher agent's `runResearcher` (web_search path, slice 3.4)
 * into the orchestrator tool registry. Translates `OrchestratorContext` to
 * `AgentContext` (which is structurally identical to `SkillContext` — only
 * `tenant` vs `org` differs in name).
 *
 * No UI side-event is emitted — the summary returned in `observation` gives
 * the orchestrator's final text turn all the material it needs to compose
 * a coherent, niche-aware reply.
 *
 * Errors (missing API key, network failures) are caught and surfaced as a
 * graceful observation so the LLM can tell the user what went wrong instead
 * of crashing the turn.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { runResearcher } from '../../agents/researcher';
import type { AgentContext } from '../../agents/types';

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('The research topic, question, or keywords to search for.'),
  depth: z
    .enum(['basic', 'advanced'])
    .optional()
    .describe(
      'Search depth: "basic" for quick lookups, "advanced" for thorough research. Defaults to "basic".',
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum number of results to return. Defaults to 5.'),
});

export type ResearchTopicInput = z.infer<typeof inputSchema>;

export interface ResearchTopicOutput {
  query: string;
  findingsCount: number;
  summary: string;
}

export function createResearchTopicTool(): OrchestratorTool<
  ResearchTopicInput,
  ResearchTopicOutput
> {
  return {
    name: 'research_topic',
    description:
      'Search the web for a topic, trend, news, or question using Tavily. Use for "research X", "find articles about Y", "what are the latest trends in Z". Returns a niche-contextualized summary. Requires AP_TAVILY_API_KEY.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      // Bridge OrchestratorContext → AgentContext (= SkillContext).
      const agentCtx: AgentContext = {
        tenant: ctx.org,
        user: ctx.user,
        db: ctx.db as unknown as PrismaClient,
        llm: ctx.llm,
        logger: ctx.logger,
      };

      try {
        const result = await runResearcher(agentCtx, {
          query: input.query,
          type: 'web_search',
          depth: input.depth,
          maxResults: input.maxResults,
        });

        ctx.logger.info(
          `research_topic: query="${input.query}" findings=${result.findings.length}`,
        );

        return {
          observation: result.summary,
          data: {
            query: result.query,
            findingsCount: result.findings.length,
            summary: result.summary,
          },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(
          `research_topic: search failed for "${input.query}": ${message}`,
        );
        return {
          observation: `Research failed for "${input.query}": ${message}. Check that AP_TAVILY_API_KEY is configured.`,
          data: { query: input.query, findingsCount: 0, summary: '' },
        };
      }
    },
  };
}
