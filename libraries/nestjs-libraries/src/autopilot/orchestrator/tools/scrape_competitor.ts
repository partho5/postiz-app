/**
 * `scrape_competitor` tool — slice 1.3.e
 *
 * Bridges the researcher agent's `runResearcher` (competitor_scrape path,
 * slice 3.5) into the orchestrator tool registry.  Translates
 * `OrchestratorContext` to `AgentContext` and delegates platform URL
 * construction + Apify actor execution to the researcher agent.
 *
 * No UI side-event is emitted — the researcher's LLM-generated summary
 * is returned as the `observation` so the orchestrator's final text turn
 * can relay a synthesized competitive insight.
 *
 * Errors (missing API key, actor failures, timeouts) are caught and surfaced
 * as a graceful observation rather than crashing the turn.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { runResearcher } from '../../agents/researcher';
import type { AgentContext } from '../../agents/types';

const inputSchema = z.object({
  handle: z
    .string()
    .min(1)
    .describe(
      'Social media handle or URL of the competitor to scrape (e.g. "@techcrunch", "hubspot", "https://www.linkedin.com/company/stripe").',
    ),
  platforms: z
    .array(z.string())
    .optional()
    .describe(
      'Platforms to scrape. Supported: twitter, linkedin, instagram, facebook, tiktok, youtube, threads. Defaults to ["twitter"].',
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum items per platform. Defaults to 5.'),
});

export type ScrapeCompetitorInput = z.infer<typeof inputSchema>;

export interface ScrapeCompetitorOutput {
  handle: string;
  platforms: string[];
  findingsCount: number;
  summary: string;
}

export function createScrapeCompetitorTool(): OrchestratorTool<
  ScrapeCompetitorInput,
  ScrapeCompetitorOutput
> {
  return {
    name: 'scrape_competitor',
    description:
      "Scrape a competitor's social media profiles via Apify to gather strategic intelligence. Use for \"analyze @handle\", \"what is competitor X posting\", \"scrape HubSpot LinkedIn\". Requires AP_APIFY_API_KEY.",
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

      const platforms = input.platforms ?? ['twitter'];

      try {
        const result = await runResearcher(agentCtx, {
          query: input.handle,
          type: 'competitor_scrape',
          handle: input.handle,
          platforms,
          maxResults: input.maxResults,
        });

        ctx.logger.info(
          `scrape_competitor: handle="${input.handle}" platforms=[${platforms.join(',')}] findings=${result.findings.length}`,
        );

        return {
          observation: result.summary,
          data: {
            handle: input.handle,
            platforms,
            findingsCount: result.findings.length,
            summary: result.summary,
          },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(
          `scrape_competitor: scrape failed for "${input.handle}": ${message}`,
        );
        return {
          observation: `Competitor scrape failed for "${input.handle}": ${message}. Check that AP_APIFY_API_KEY is configured.`,
          data: { handle: input.handle, platforms, findingsCount: 0, summary: '' },
        };
      }
    },
  };
}
