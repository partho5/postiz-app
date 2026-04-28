/**
 * `update_posts_per_day` tool — slice E.2
 *
 * Updates the posts-per-day count for one platform's cadence config.
 * Upserts via applyCadenceConfig.
 *
 * Use when the user says "post twice a day on Twitter", "LinkedIn 3 posts daily".
 * NOT for a global cap across all platforms — use set_frequency_cap for that.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { applyCadenceConfig } from '../../stack/cadence-config.service';

const inputSchema = z.object({
  platform: z.string().describe('Platform slug (e.g. "linkedin", "twitter").'),
  postsPerDay: z
    .number()
    .int()
    .min(1)
    .max(50)
    .describe('Number of posts per day (1–50).'),
});

export type UpdatePostsPerDayInput = z.infer<typeof inputSchema>;

export interface UpdatePostsPerDayOutput {
  platform: string;
  postsPerDay: number;
}

export function createUpdatePostsPerDayTool(): OrchestratorTool<
  UpdatePostsPerDayInput,
  UpdatePostsPerDayOutput
> {
  return {
    name: 'update_posts_per_day',
    description:
      'Update the number of posts per day for one specific platform (e.g. "post 3 times a day on LinkedIn"). NOT for a global cross-platform cap — use set_frequency_cap for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      await applyCadenceConfig(db, ctx.org.id, input.platform, {
        postsPerDay: input.postsPerDay,
      });

      const message = `Set ${input.platform} to ${input.postsPerDay} post(s) per day.`;

      ctx.emit({ type: 'action_result', action: 'update_posts_per_day', ok: true, message });
      ctx.logger.info(
        `update_posts_per_day: org=${ctx.org.id} platform=${input.platform} postsPerDay=${input.postsPerDay}`,
      );

      return {
        observation: message,
        data: { platform: input.platform, postsPerDay: input.postsPerDay },
        emitted: true,
      };
    },
  };
}
