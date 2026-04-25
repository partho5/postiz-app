/**
 * `analytics_snapshot` tool — slice 1.3.e
 *
 * Bridges the `analytics_snapshot` skill (slice 4.1) into the orchestrator
 * tool registry. Translates an `OrchestratorContext` to the `SkillContext`
 * the skill expects, then maps the raw `AnalyticsData[]` into the
 * `analytics_card` SSE event for the chat UI.
 *
 * Emits `analytics_card` only when the platform is connected AND has data;
 * the observation is always populated so the LLM can compose a coherent reply
 * even in the unsupported / no-data cases.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { handleAnalyticsSnapshot } from '../../skills/analytics_snapshot';
import type { SkillContext } from '../../skills/types';

const inputSchema = z.object({
  platform: z
    .string()
    .min(1)
    .describe(
      'Postiz providerIdentifier for the platform (e.g. "twitter", "linkedin", "instagram", "facebook").',
    ),
  integrationId: z
    .string()
    .optional()
    .describe(
      'Optional Integration.id to disambiguate when the tenant has multiple accounts for the same platform.',
    ),
  periodDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Number of days to look back. Defaults to 30.'),
});

export type AnalyticsSnapshotToolInput = z.infer<typeof inputSchema>;

export interface AnalyticsSnapshotToolOutput {
  platform: string;
  integrationId: string;
  supported: boolean;
  periodDays: number;
  dataPoints: number;
  capturedAt: string;
  note?: string;
}

export function createAnalyticsSnapshotTool(): OrchestratorTool<
  AnalyticsSnapshotToolInput,
  AnalyticsSnapshotToolOutput
> {
  return {
    name: 'analytics_snapshot',
    description:
      'Fetch per-platform analytics (impressions, likes, comments, shares) for a connected social account. Use for "how did my LinkedIn perform last week?", "show me Twitter stats", "what are my Instagram numbers". Emits an analytics_card to the chat UI.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      // Bridge OrchestratorContext → SkillContext (tenant ↔ org).
      const skillCtx: SkillContext = {
        tenant: ctx.org,
        user: ctx.user,
        db: ctx.db as unknown as PrismaClient,
        llm: ctx.llm,
        logger: ctx.logger,
      };

      const result = await handleAnalyticsSnapshot(skillCtx, {
        platform: input.platform,
        integrationId: input.integrationId,
        periodDays: input.periodDays,
      });

      // Emit UI card when we have actual metrics to display.
      const hasData = result.supported && result.data.length > 0;
      if (hasData) {
        const metrics = result.data.map((d) => {
          const total = d.data.reduce(
            (sum, pt) => sum + (parseFloat(pt.total) || 0),
            0,
          );
          const trend: 'up' | 'down' | 'flat' =
            d.percentageChange > 0
              ? 'up'
              : d.percentageChange < 0
                ? 'down'
                : 'flat';
          return { label: d.label, value: Math.round(total), trend };
        });

        ctx.emit({
          type: 'analytics_card',
          platform: result.platform,
          periodDays: result.periodDays,
          metrics,
          capturedAt: result.capturedAt,
        });
      }

      // Build observation the LLM uses to compose its reply.
      let observation: string;
      if (!result.supported) {
        observation = `No analytics available for ${result.platform}: ${result.note ?? 'platform not connected or analytics not supported'}.`;
      } else if (result.data.length === 0) {
        observation = `${result.integrationName || result.platform} has no analytics data for the last ${result.periodDays} days.${result.note ? ` Note: ${result.note}` : ''}`;
      } else {
        const summary = result.data
          .map((d) => {
            const total = d.data.reduce(
              (sum, pt) => sum + (parseFloat(pt.total) || 0),
              0,
            );
            const dir =
              d.percentageChange > 0
                ? `+${d.percentageChange.toFixed(1)}%`
                : d.percentageChange < 0
                  ? `${d.percentageChange.toFixed(1)}%`
                  : 'flat';
            return `${d.label}: ${Math.round(total)} (${dir})`;
          })
          .join(', ');
        observation = `Analytics for ${result.integrationName || result.platform} (${result.periodDays}d): ${summary}.${result.note ? ` Note: ${result.note}` : ''}`;
      }

      ctx.logger.info(
        `analytics_snapshot: platform=${result.platform} supported=${result.supported} dataPoints=${result.data.length}`,
      );

      return {
        observation,
        data: {
          platform: result.platform,
          integrationId: result.integrationId,
          supported: result.supported,
          periodDays: result.periodDays,
          dataPoints: result.data.length,
          capturedAt: result.capturedAt,
          note: result.note,
        },
        emitted: hasData,
      };
    },
  };
}
