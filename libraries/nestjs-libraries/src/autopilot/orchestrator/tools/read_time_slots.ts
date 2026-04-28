/**
 * `read_time_slots` tool — slice E.1
 *
 * Reads the tenant's cadence configuration: preferred posting times
 * (preferredTimes) and posts-per-day per platform. Pure DB read;
 * no UI card emitted — the LLM narrates the result in human voice.
 *
 * Use when the user asks "what are my scheduled times?", "what time slots
 * do I have set?", "how many posts per day am I doing?", "what's my cadence?".
 * NOT for listing upcoming posts — use list_scheduled_posts for that.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z
  .object({
    platform: z
      .string()
      .optional()
      .describe('Filter to one platform slug (e.g. "linkedin"). Omit for all.'),
  })
  .describe('Read cadence preferred times and posts-per-day per platform.');

export type ReadTimeSlotsInput = z.infer<typeof inputSchema>;

export interface ReadTimeSlotsOutput {
  configs: Array<{
    platform: string;
    preferredTimes: string[];
    postsPerDay: number;
    timezone: string;
    paused: boolean;
    pausedUntil: string | null;
    active: boolean;
  }>;
}

export function createReadTimeSlotsTool(): OrchestratorTool<
  ReadTimeSlotsInput,
  ReadTimeSlotsOutput
> {
  return {
    name: 'read_time_slots',
    description:
      'Read the tenant\'s cadence preferred posting times and posts-per-day per platform. Use when the user asks "what are my scheduled times?", "what time slots?", "what\'s my cadence?", "how many posts/day?". NOT for listing upcoming posts — use list_scheduled_posts for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const now = ctx.now;

      const rows = await ctx.db.apCadenceConfig.findMany({
        where: {
          organizationId: ctx.org.id,
          ...(input.platform ? { platform: input.platform } : {}),
        },
        orderBy: { platform: 'asc' },
      });

      const configs = rows.map((r) => {
        const paused = r.pausedUntil != null && r.pausedUntil > now;
        return {
          platform: r.platform,
          preferredTimes: Array.isArray(r.preferredTimes)
            ? (r.preferredTimes as string[])
            : [],
          postsPerDay: r.postsPerDay,
          timezone: r.timezone,
          paused,
          pausedUntil: r.pausedUntil ? r.pausedUntil.toISOString() : null,
          active: r.active,
        };
      });

      let observation: string;
      if (configs.length === 0) {
        observation = input.platform
          ? `No cadence config found for platform "${input.platform}".`
          : 'No cadence configuration found. The user has not set up any posting schedule yet.';
      } else {
        const lines = configs.map((c) => {
          const times =
            c.preferredTimes.length > 0
              ? c.preferredTimes.join(', ')
              : '(no preferred times set)';
          const status = !c.active
            ? 'inactive'
            : c.paused
              ? `paused until ${c.pausedUntil}`
              : 'active';
          return `${c.platform}: ${c.postsPerDay} post(s)/day at ${times} (${c.timezone}) — ${status}`;
        });
        observation = `Cadence config (${configs.length} platform(s)):\n${lines.join('\n')}`;
      }

      ctx.logger.info(
        `read_time_slots: org=${ctx.org.id} platforms=${configs.map((c) => c.platform).join(',')}`,
      );

      return {
        observation,
        data: { configs },
      };
    },
  };
}
