/**
 * `update_time_slots` tool — slice E.2
 *
 * Updates the preferred posting times for one platform's cadence config.
 * Times are HH:MM strings in the platform's configured timezone.
 * Upserts via applyCadenceConfig so it is safe for platforms not yet configured.
 *
 * Use when the user says "post at 9am and 5pm", "change my LinkedIn times to 10:00 and 14:00".
 * NOT for changing posts-per-day — use update_posts_per_day for that.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { applyCadenceConfig } from '../../stack/cadence-config.service';

const inputSchema = z.object({
  platform: z.string().describe('Platform slug (e.g. "linkedin", "twitter").'),
  times: z
    .array(z.string())
    .min(1)
    .max(24)
    .describe(
      'Preferred posting times as HH:MM strings (e.g. ["09:00","17:00"]). Replaces the current list entirely.',
    ),
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone (e.g. "America/New_York"). Omit to keep existing timezone.'),
});

export type UpdateTimeSlotsInput = z.infer<typeof inputSchema>;

export interface UpdateTimeSlotsOutput {
  platform: string;
  preferredTimes: string[];
  timezone?: string;
}

function normaliseTime(raw: string): string {
  const [h = '0', m = '0'] = raw.trim().split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function createUpdateTimeSlotsTool(): OrchestratorTool<
  UpdateTimeSlotsInput,
  UpdateTimeSlotsOutput
> {
  return {
    name: 'update_time_slots',
    description:
      'Update the preferred posting times for one platform (e.g. "post LinkedIn at 09:00 and 17:00"). Pass times as HH:MM strings. Replaces the existing list. NOT for changing posts-per-day — use update_posts_per_day for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;
      const times = input.times.map(normaliseTime);
      const changes: Record<string, unknown> = { preferredTimes: times };
      if (input.timezone) changes.timezone = input.timezone;

      await applyCadenceConfig(db, ctx.org.id, input.platform, changes);

      const tzNote = input.timezone ? ` (timezone: ${input.timezone})` : '';
      const message = `Updated ${input.platform} posting times to ${times.join(', ')}${tzNote}.`;

      ctx.emit({ type: 'action_result', action: 'update_time_slots', ok: true, message });
      ctx.logger.info(`update_time_slots: org=${ctx.org.id} platform=${input.platform} times=[${times.join(',')}]`);

      return {
        observation: message,
        data: { platform: input.platform, preferredTimes: times, timezone: input.timezone },
        emitted: true,
      };
    },
  };
}
