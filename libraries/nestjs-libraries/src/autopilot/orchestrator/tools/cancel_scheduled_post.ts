/**
 * `cancel_scheduled_post` tool — cancel one or many PENDING slots in one call
 *
 * Accepts an array of slot IDs. Each is cancelled independently; failures
 * on individual slots are reported in the observation without aborting the
 * rest. A single cancel is just slotIds:["id"] — same code path.
 */

import { ApPostCandidateStatus, ApScheduledSlotStatus } from '@prisma/client';
import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { formatForUser } from '../../time/parse';

const inputSchema = z.object({
  slotIds: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe(
      'Array of ApScheduledSlot IDs to cancel. Get IDs from `list_scheduled_posts`. Even for a single cancel, pass an array: ["id"].',
    ),
  reason: z
    .string()
    .optional()
    .describe('Optional one-line reason stored in slot metadata.'),
});

export type CancelScheduledPostInput = z.infer<typeof inputSchema>;

export interface CancelScheduledPostOutput {
  cancelled: number;
  skipped: number;
  results: Array<{ slotId: string; ok: boolean; note: string }>;
}

export function createCancelScheduledPostTool(): OrchestratorTool<
  CancelScheduledPostInput,
  CancelScheduledPostOutput
> {
  return {
    name: 'cancel_scheduled_post',
    description:
      'Cancel one or more already-scheduled (not yet published) posts by their slot IDs. Pass all IDs at once — slotIds:["id1","id2","id3"]. For a single cancel: slotIds:["id"]. Does NOT affect published posts — use `rollback_published_post` for those.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const results: CancelScheduledPostOutput['results'] = [];
      let cancelled = 0;
      let skipped = 0;

      for (const slotId of input.slotIds) {
        const slot = await ctx.db.apScheduledSlot.findFirst({
          where: { id: slotId, organizationId: ctx.org.id },
          select: { id: true, platform: true, status: true, scheduledAt: true, metadata: true, postCandidateId: true },
        });

        if (!slot) {
          results.push({ slotId, ok: false, note: 'not found' });
          skipped++;
          continue;
        }

        if (slot.status !== ApScheduledSlotStatus.PENDING) {
          const humanTime = formatForUser(slot.scheduledAt, { now: ctx.now, timezone: ctx.timezone });
          results.push({ slotId, ok: false, note: `already ${slot.status.toLowerCase()} (${slot.platform}, ${humanTime})` });
          skipped++;
          continue;
        }

        const existingMeta = (slot.metadata as Record<string, unknown>) ?? {};
        await ctx.db.apScheduledSlot.update({
          where: { id: slot.id },
          data: {
            status: ApScheduledSlotStatus.CANCELLED,
            metadata: {
              ...existingMeta,
              cancelledAt: ctx.now.toISOString(),
              cancelledBy: ctx.user.id,
              cancelReason: input.reason ?? 'user cancelled via chat',
            },
          },
        });

        // Per-post candidate: return it to the stack so it can be picked up again.
        if (slot.postCandidateId) {
          await ctx.db.apPostCandidate.updateMany({
            where: { id: slot.postCandidateId, organizationId: ctx.org.id, status: ApPostCandidateStatus.SCHEDULED },
            data: { status: ApPostCandidateStatus.PENDING },
          });
        }

        const humanTime = formatForUser(slot.scheduledAt, { now: ctx.now, timezone: ctx.timezone });
        results.push({ slotId, ok: true, note: `cancelled ${slot.platform} post for ${humanTime}` });
        cancelled++;
      }

      const message = cancelled === 0
        ? `No slots were cancelled (${skipped} skipped — check if they were already cancelled or published).`
        : `Cancelled ${cancelled} post${cancelled === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} skipped` : ''}.`;

      ctx.emit({ type: 'action_result', action: 'cancel_scheduled_post', ok: cancelled > 0, message });

      return {
        observation: message,
        data: { cancelled, skipped, results },
        emitted: true,
      };
    },
  };
}
