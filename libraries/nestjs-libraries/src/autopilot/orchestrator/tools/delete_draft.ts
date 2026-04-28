/**
 * `delete_draft` tool — slice E.3
 *
 * Soft-deletes a PENDING or SCHEDULED draft by setting its status to FAILED
 * with metadata { deleted_by: 'user' }. Emits action_result.
 *
 * Use when the user says "delete draft <id>", "remove that draft from the queue".
 * For the in-progress multi-turn flow, use cancel_pending_draft instead.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const DELETABLE_STATUSES = new Set(['PENDING', 'SCHEDULED']);

const inputSchema = z.object({
  id: z.string().describe('The draft ID to delete.'),
});

export type DeleteDraftInput = z.infer<typeof inputSchema>;

export interface DeleteDraftOutput {
  deleted: boolean;
  id: string;
}

export function createDeleteDraftTool(): OrchestratorTool<DeleteDraftInput, DeleteDraftOutput> {
  return {
    name: 'delete_draft',
    description:
      'Delete (soft-remove) a pending draft from the queue. Works on PENDING or SCHEDULED drafts. Use when the user says "delete draft <id>", "remove that draft". NOT for cancelling the in-progress post-creation flow — use cancel_pending_draft for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const row = await ctx.db.apPostCandidate.findFirst({
        where: { id: input.id, organizationId: ctx.org.id },
      });

      if (!row) {
        return {
          observation: `Draft "${input.id}" not found.`,
          data: { deleted: false, id: input.id },
        };
      }

      if (!DELETABLE_STATUSES.has(row.status)) {
        return {
          observation: `Draft "${input.id}" is ${row.status} and cannot be deleted.`,
          data: { deleted: false, id: input.id },
        };
      }

      await ctx.db.apPostCandidate.update({
        where: { id: input.id },
        data: {
          status: 'FAILED',
          metadata: { ...(row.metadata as object), deleted_by: 'user', deleted_at: ctx.now.toISOString() },
        },
      });

      const message = `Deleted draft ${input.id}.`;
      ctx.emit({ type: 'action_result', action: 'delete_draft', ok: true, message });
      ctx.logger.info(`delete_draft: org=${ctx.org.id} id=${input.id}`);

      return {
        observation: message,
        data: { deleted: true, id: input.id },
        emitted: true,
      };
    },
  };
}
