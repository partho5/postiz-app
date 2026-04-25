/**
 * `reschedule_post` tool — move one or many PENDING slots to new times
 *
 * `slotIds` and `times` are parallel arrays: slotIds[i] moves to times[i].
 * They must have equal length — the tool validates this before touching DB.
 * A single reschedule is just slotIds:["id"], times:["Monday 9am"].
 */

import { ApScheduledSlotStatus } from '@prisma/client';
import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { formatForUser, parseTimeExpression } from '../../time/parse';

const inputSchema = z.object({
  slotIds: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe(
      'Array of ApScheduledSlot IDs to reschedule. Must be the same length as `times`. Get IDs from `list_scheduled_posts`.',
    ),
  times: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe(
      'Parallel array of new times — natural language or ISO 8601. times[i] is the new time for slotIds[i]. Must be the same length as `slotIds`.',
    ),
  reason: z
    .string()
    .optional()
    .describe('Optional one-line reason stored in slot metadata.'),
});

export type ReschedulePostInput = z.infer<typeof inputSchema>;

export interface ReschedulePostOutput {
  rescheduled: number;
  skipped: number;
  results: Array<{
    slotId: string;
    ok: boolean;
    priorScheduledAt: string | null;
    newScheduledAt: string | null;
    note: string;
  }>;
}

export function createReschedulePostTool(): OrchestratorTool<
  ReschedulePostInput,
  ReschedulePostOutput
> {
  return {
    name: 'reschedule_post',
    description:
      'Move one or more PENDING scheduled posts to new times. `slotIds` and `times` are parallel arrays of equal length — slotIds[i] moves to times[i]. Single reschedule: slotIds:["id"], times:["Monday 9am"]. Batch: slotIds:["a","b","c"], times:["Mon 9am","Tue 9am","Wed 9am"].',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      if (input.slotIds.length !== input.times.length) {
        return {
          observation: `slotIds (${input.slotIds.length}) and times (${input.times.length}) must have equal length. Fix the arrays and try again.`,
          data: { rescheduled: 0, skipped: input.slotIds.length, results: [] },
        };
      }

      const results: ReschedulePostOutput['results'] = [];
      let rescheduled = 0;
      let skipped = 0;

      for (let i = 0; i < input.slotIds.length; i++) {
        const slotId = input.slotIds[i];
        const timeExpr = input.times[i];

        const parsed = parseTimeExpression(timeExpr, {
          now: ctx.now,
          timezone: ctx.timezone,
          forwardOnly: true,
        });

        if (!parsed || parsed.isPast) {
          results.push({ slotId, ok: false, priorScheduledAt: null, newScheduledAt: null, note: `could not parse time "${timeExpr}" or it is in the past` });
          skipped++;
          continue;
        }

        const slot = await ctx.db.apScheduledSlot.findFirst({
          where: { id: slotId, organizationId: ctx.org.id },
          select: { id: true, platform: true, status: true, scheduledAt: true, metadata: true },
        });

        if (!slot) {
          results.push({ slotId, ok: false, priorScheduledAt: null, newScheduledAt: null, note: 'not found' });
          skipped++;
          continue;
        }

        if (slot.status !== ApScheduledSlotStatus.PENDING) {
          results.push({ slotId, ok: false, priorScheduledAt: slot.scheduledAt.toISOString(), newScheduledAt: null, note: `already ${slot.status.toLowerCase()}` });
          skipped++;
          continue;
        }

        const collision = await ctx.db.apScheduledSlot.findFirst({
          where: {
            organizationId: ctx.org.id,
            platform: slot.platform,
            scheduledAt: parsed.date,
            status: ApScheduledSlotStatus.PENDING,
            id: { not: slot.id },
          },
          select: { id: true },
        });

        if (collision) {
          results.push({ slotId, ok: false, priorScheduledAt: slot.scheduledAt.toISOString(), newScheduledAt: parsed.date.toISOString(), note: `collision — another ${slot.platform} post already at that time` });
          skipped++;
          continue;
        }

        const existingMeta = (slot.metadata as Record<string, unknown>) ?? {};
        await ctx.db.apScheduledSlot.update({
          where: { id: slot.id },
          data: {
            scheduledAt: parsed.date,
            metadata: {
              ...existingMeta,
              rescheduledAt: ctx.now.toISOString(),
              rescheduledBy: ctx.user.id,
              rescheduledFrom: slot.scheduledAt.toISOString(),
              rescheduleReason: input.reason ?? 'user rescheduled via chat',
            },
          },
        });

        const humanTime = formatForUser(parsed.date, { now: ctx.now, timezone: ctx.timezone });
        results.push({ slotId, ok: true, priorScheduledAt: slot.scheduledAt.toISOString(), newScheduledAt: parsed.date.toISOString(), note: `moved ${slot.platform} post to ${humanTime}` });
        rescheduled++;
      }

      const message = rescheduled === 0
        ? `No slots were rescheduled (${skipped} skipped).`
        : `Rescheduled ${rescheduled} post${rescheduled === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} skipped` : ''}.`;

      ctx.emit({ type: 'action_result', action: 'reschedule_post', ok: rescheduled > 0, message });

      return {
        observation: message,
        data: { rescheduled, skipped, results },
        emitted: true,
      };
    },
  };
}
