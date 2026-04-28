/**
 * `reject_draft` tool — slice E.3
 *
 * Rejects a draft after human review: sets status to FAILED with metadata
 * { rejected_by: 'user' }. Removes it from the publish queue.
 * Emits action_result.
 *
 * Semantically distinct from delete_draft: reject is a review-workflow verdict
 * ("this draft isn't good enough"), while delete is a housekeeping action.
 * Both have the same underlying effect.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const REJECTABLE_STATUSES = new Set(['PENDING', 'SCHEDULED']);

const inputSchema = z.object({
  id: z.string().describe('The draft ID to reject.'),
  reason: z.string().optional().describe('Optional reason recorded in metadata.'),
});

export type RejectDraftInput = z.infer<typeof inputSchema>;

export interface RejectDraftOutput {
  rejected: boolean;
  id: string;
}

export function createRejectDraftTool(): OrchestratorTool<RejectDraftInput, RejectDraftOutput> {
  return {
    name: 'reject_draft',
    description:
      'Reject a draft after review — removes it from the publish queue. Use when the user says "reject draft <id>", "this draft is not good", "discard it". Optionally provide a reason.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const row = await ctx.db.apPostCandidate.findFirst({
        where: { id: input.id, organizationId: ctx.org.id },
      });

      if (!row) {
        return {
          observation: `Draft "${input.id}" not found.`,
          data: { rejected: false, id: input.id },
        };
      }

      if (!REJECTABLE_STATUSES.has(row.status)) {
        return {
          observation: `Draft "${input.id}" is ${row.status} — only PENDING or SCHEDULED drafts can be rejected.`,
          data: { rejected: false, id: input.id },
        };
      }

      await ctx.db.apPostCandidate.update({
        where: { id: input.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...(row.metadata as object),
            rejected_by: 'user',
            rejected_at: ctx.now.toISOString(),
            ...(input.reason ? { rejection_reason: input.reason } : {}),
          },
        },
      });

      const reasonNote = input.reason ? ` Reason: ${input.reason}` : '';
      const message = `Rejected draft ${input.id}.${reasonNote}`;
      ctx.emit({ type: 'action_result', action: 'reject_draft', ok: true, message });
      ctx.logger.info(`reject_draft: org=${ctx.org.id} id=${input.id}`);

      return {
        observation: message,
        data: { rejected: true, id: input.id },
        emitted: true,
      };
    },
  };
}
