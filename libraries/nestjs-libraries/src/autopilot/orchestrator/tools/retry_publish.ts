/**
 * `retry_publish` tool — slice E.6
 *
 * Given a SKIPPED `ApScheduledSlot` ID, creates a fresh PENDING slot for the
 * same (org, platform) at a new time so the scheduler cron will pick it up
 * on its next pass. Emits `action_result`.
 *
 * Use when the user says "retry slot <id>", "reschedule the failed publish",
 * "try again for that skipped post".
 */

import { z } from 'zod';
import { parseTimeExpression, formatForUser } from '../../time/parse';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  slotId: z
    .string()
    .describe('The ID of the SKIPPED ApScheduledSlot to retry.'),
  when: z
    .string()
    .optional()
    .describe(
      'When to retry (natural language or ISO 8601). Defaults to now + 5 minutes if omitted.',
    ),
});

export type RetryPublishInput = z.infer<typeof inputSchema>;

export interface RetryPublishOutput {
  originalSlotId: string;
  newSlotId: string;
  platform: string;
  scheduledAt: string;
}

export function createRetryPublishTool(): OrchestratorTool<RetryPublishInput, RetryPublishOutput> {
  return {
    name: 'retry_publish',
    description:
      'Retry a failed/skipped publishing slot by creating a new PENDING slot at a specified time (default: 5 minutes from now). Use for "retry slot <id>", "reschedule the failed publish", "try again for that skipped post". Emits action_result.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      // Load the original slot
      const original = await ctx.db.apScheduledSlot.findFirst({
        where: { id: input.slotId, organizationId: ctx.org.id },
      });

      if (!original) {
        return {
          observation: `Slot "${input.slotId}" not found (or does not belong to this account).`,
          data: { originalSlotId: input.slotId, newSlotId: '', platform: '', scheduledAt: '' },
        };
      }

      if (original.status !== 'SKIPPED') {
        return {
          observation: `Slot "${input.slotId}" has status "${original.status}" — only SKIPPED slots can be retried.`,
          data: { originalSlotId: input.slotId, newSlotId: '', platform: original.platform, scheduledAt: '' },
        };
      }

      // Resolve the retry time
      let scheduledAt: Date;
      if (input.when) {
        const parsed = parseTimeExpression(input.when, {
          now: ctx.now,
          timezone: ctx.timezone,
          forwardOnly: true,
        });
        if (!parsed || parsed.isPast) {
          return {
            observation: `Could not parse "${input.when}" as a future time. Please provide a clearer time (e.g. "in 10 minutes", "tomorrow 9am").`,
            data: { originalSlotId: input.slotId, newSlotId: '', platform: original.platform, scheduledAt: '' },
          };
        }
        scheduledAt = parsed.date;
      } else {
        // Default: 5 minutes from now
        scheduledAt = new Date(ctx.now.getTime() + 5 * 60_000);
      }

      // Create a fresh PENDING slot
      const newSlot = await ctx.db.apScheduledSlot.create({
        data: {
          organizationId: ctx.org.id,
          platform: original.platform,
          scheduledAt,
          status: 'PENDING',
          metadata: {
            retriedFromSlotId: original.id,
            retryReason: 'manual_retry',
          },
        },
      });

      const when = formatForUser(scheduledAt, { now: ctx.now, timezone: ctx.timezone });

      ctx.emit({
        type: 'action_result',
        action: 'retry_publish',
        ok: true,
        message: `Retry slot created for ${original.platform} — scheduled ${when} (new slot ID: ${newSlot.id}).`,
      });

      ctx.logger.info(
        `retry_publish: org=${ctx.org.id} originalSlot=${original.id} newSlot=${newSlot.id} scheduledAt=${scheduledAt.toISOString()}`,
      );

      return {
        observation: `Retry slot created for ${original.platform} — scheduled ${when}. New slot ID: ${newSlot.id}. The scheduler will pick it up within the next minute.`,
        data: {
          originalSlotId: original.id,
          newSlotId: newSlot.id,
          platform: original.platform,
          scheduledAt: scheduledAt.toISOString(),
        },
        emitted: true,
      };
    },
  };
}
