/**
 * `compute_best_times` tool — slice E.4
 *
 * Analyses the tenant's `ApPublishedPost` history to surface which hours of the
 * day have been most frequently used for publishing, per platform. When no
 * history exists it returns a generic evidence-free recommendation note so the
 * LLM can still give a useful reply.
 *
 * Pure read — LLM narrates. No SSE card emitted.
 *
 * Use when the user asks "when should I post?", "what's the best time to post
 * on LinkedIn?", "compute best posting times". NOT for reading configured slot
 * times — use read_time_slots. NOT for listing scheduled posts — use
 * list_scheduled_posts.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  platform: z
    .string()
    .optional()
    .describe(
      'Narrow analysis to one platform slug (e.g. "linkedin"). Omit to compute for all active platforms.',
    ),
  lookbackDays: z
    .number()
    .int()
    .min(7)
    .max(90)
    .optional()
    .describe(
      'How many days of publish history to analyse (7–90). Defaults to 30.',
    ),
});

export type ComputeBestTimesInput = z.infer<typeof inputSchema>;

export interface PlatformBestTimes {
  platform: string;
  publishCount: number;
  topHours: number[]; // UTC hours sorted by frequency, top 3
  recommendation: string; // human-readable sentence
}

export interface ComputeBestTimesOutput {
  lookbackDays: number;
  platforms: PlatformBestTimes[];
  note: string;
}

// Generic advice when there is no history for a platform
const GENERIC_TIPS: Record<string, string> = {
  twitter: 'Generally 08:00–10:00 and 18:00–20:00 UTC see high engagement.',
  linkedin: 'Business hours 08:00–10:00 and 12:00–14:00 UTC tend to perform well.',
  instagram: 'Midday 11:00–13:00 and evening 19:00–21:00 UTC are commonly effective.',
  facebook: 'Late morning 09:00–12:00 UTC works well for most niches.',
  tiktok: 'Peak hours vary widely; 14:00–16:00 and 19:00–21:00 UTC are common.',
  youtube: 'Afternoons 15:00–17:00 UTC on weekdays tend to drive views.',
  threads: 'Similar to Instagram — midday 11:00–13:00 UTC is a safe default.',
};

const DEFAULT_TIP = 'Try 09:00–11:00 UTC as a starting point and adjust based on your analytics.';

export function createComputeBestTimesTool(): OrchestratorTool<
  ComputeBestTimesInput,
  ComputeBestTimesOutput
> {
  return {
    name: 'compute_best_times',
    description:
      "Analyse the tenant's publishing history to recommend optimal posting hours per platform. Use when the user asks 'when should I post?', 'best time to post on LinkedIn?', 'compute best times'. NOT for reading configured slot times — use read_time_slots. NOT for listing scheduled posts — use list_scheduled_posts.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const lookbackDays = input.lookbackDays ?? 30;
      const since = new Date(ctx.now.getTime() - lookbackDays * 24 * 60 * 60_000);

      const publishedPosts = await ctx.db.apPublishedPost.findMany({
        where: {
          organizationId: ctx.org.id,
          publishedAt: { gte: since },
          ...(input.platform ? { platform: input.platform } : {}),
        },
        select: { platform: true, publishedAt: true },
        orderBy: { publishedAt: 'asc' },
      });

      // Bucket by (platform, UTC hour)
      const byPlatform = new Map<string, Map<number, number>>();
      for (const p of publishedPosts) {
        const hour = p.publishedAt.getUTCHours();
        if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, new Map());
        const hours = byPlatform.get(p.platform)!;
        hours.set(hour, (hours.get(hour) ?? 0) + 1);
      }

      const platforms: PlatformBestTimes[] = [];

      if (byPlatform.size === 0) {
        // No history — return generic tips for requested platform or a generic note
        const plist = input.platform ? [input.platform] : [];
        if (plist.length === 0) {
          // No platform filter and no history
          return {
            observation:
              `No publish history in the last ${lookbackDays} days. ` +
              'Without data I can only offer generic guidance: ' +
              'for most platforms, morning (08:00–10:00 UTC) and early evening (18:00–20:00 UTC) ' +
              'are safe starting points. Post consistently for 2–4 weeks to build reliable data.',
            data: { lookbackDays, platforms: [], note: 'no_history' },
          };
        }
        const tip = GENERIC_TIPS[input.platform!.toLowerCase()] ?? DEFAULT_TIP;
        platforms.push({
          platform: input.platform!,
          publishCount: 0,
          topHours: [],
          recommendation: `No history for ${input.platform} yet. Generic advice: ${tip}`,
        });
      } else {
        for (const [plat, hourMap] of byPlatform) {
          const sorted = Array.from(hourMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([h]) => h);
          const publishCount = Array.from(hourMap.values()).reduce((s, c) => s + c, 0);
          const topStr =
            sorted.length > 0
              ? sorted.map((h) => `${pad(h)}:00 UTC`).join(', ')
              : 'n/a';
          platforms.push({
            platform: plat,
            publishCount,
            topHours: sorted,
            recommendation:
              `Based on ${publishCount} post${publishCount === 1 ? '' : 's'} in the last ` +
              `${lookbackDays} days, your top publishing hours are: ${topStr}.`,
          });
        }
      }

      const observation =
        platforms.length === 0
          ? `No publish history in the last ${lookbackDays} days.`
          : `Best-time analysis (last ${lookbackDays} days):\n` +
            platforms
              .map(
                (p) =>
                  `• [${p.platform}] ${p.recommendation}`,
              )
              .join('\n') +
            '\n\nThese are based on your own publishing history. ' +
            'For audience-tuned advice, check your platform analytics once you have a few weeks of data.';

      ctx.logger.info(
        `compute_best_times: org=${ctx.org.id} lookback=${lookbackDays} posts=${publishedPosts.length}`,
      );

      return {
        observation,
        data: { lookbackDays, platforms, note: 'history_based' },
      };
    },
  };
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}
