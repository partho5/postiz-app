/**
 * `set_frequency_cap` tool — slice E.2
 *
 * Applies a posts-per-day cap to all active platforms or a specific subset.
 * Use when the user wants a global limit: "cap at 2 posts per day", "never
 * more than 3 posts a day on any platform".
 * For changing one platform only, use update_posts_per_day instead.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { applyCadenceConfig } from '../../stack/cadence-config.service';

const inputSchema = z.object({
  postsPerDay: z
    .number()
    .int()
    .min(1)
    .max(50)
    .describe('Maximum posts per day to apply (1–50).'),
  platforms: z
    .array(z.string())
    .optional()
    .describe('Platform slugs to apply the cap to. Omit to apply to ALL active platforms.'),
});

export type SetFrequencyCapInput = z.infer<typeof inputSchema>;

export interface SetFrequencyCapOutput {
  appliedTo: string[];
  postsPerDay: number;
}

export function createSetFrequencyCapTool(): OrchestratorTool<
  SetFrequencyCapInput,
  SetFrequencyCapOutput
> {
  return {
    name: 'set_frequency_cap',
    description:
      'Apply a posts-per-day cap to all platforms (or a specified subset). Use for global limits: "cap everything at 2 posts/day". To change only one platform, use update_posts_per_day instead.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      let platforms: string[];

      if (input.platforms?.length) {
        platforms = input.platforms;
      } else {
        const configs = await ctx.db.apCadenceConfig.findMany({
          where: { organizationId: ctx.org.id, active: true },
          select: { platform: true },
        });
        platforms = configs.map((c) => c.platform);

        if (platforms.length === 0) {
          return {
            observation: 'No active cadence configs found — nothing to cap.',
            data: { appliedTo: [], postsPerDay: input.postsPerDay },
          };
        }
      }

      for (const platform of platforms) {
        await applyCadenceConfig(db, ctx.org.id, platform, { postsPerDay: input.postsPerDay });
      }

      const platformList = platforms.join(', ');
      const message =
        platforms.length === 1
          ? `Capped ${platforms[0]} at ${input.postsPerDay} post(s)/day.`
          : `Capped ${platformList} at ${input.postsPerDay} post(s)/day.`;

      ctx.emit({ type: 'action_result', action: 'set_frequency_cap', ok: true, message });
      ctx.logger.info(
        `set_frequency_cap: org=${ctx.org.id} platforms=[${platformList}] cap=${input.postsPerDay}`,
      );

      return {
        observation: message,
        data: { appliedTo: platforms, postsPerDay: input.postsPerDay },
        emitted: true,
      };
    },
  };
}
