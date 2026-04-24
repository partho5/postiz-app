/**
 * `cancel_pending_draft` tool — slice 1.3.c
 *
 * Aborts any in-progress multi-turn post-creation flow for the tenant
 * (i.e. deletes the row in `ap_pending_action`). The orchestrator calls
 * this when the user clearly wants to drop the current line of thought
 * — "never mind", "cancel that", or before starting a brand-new request
 * while a different one is still pending.
 *
 * This only cancels the pending DRAFT — it does not touch already-
 * scheduled posts. Use `cancel_scheduled_post` (slice 1.3.d) for those.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import type { DirectActionHandler } from '../../chat/direct_action_handler';

const inputSchema = z.object({
  reason: z
    .string()
    .optional()
    .describe(
      'Optional one-line reason for the cancellation. Surfaces in logs only.',
    ),
});

export type CancelPendingDraftInput = z.infer<typeof inputSchema>;
export interface CancelPendingDraftOutput {
  cancelled: boolean;
}

export interface CancelPendingDraftDeps {
  directAction: Pick<DirectActionHandler, 'cancelAction'>;
}

export function createCancelPendingDraftTool(
  deps: CancelPendingDraftDeps,
): OrchestratorTool<CancelPendingDraftInput, CancelPendingDraftOutput> {
  return {
    name: 'cancel_pending_draft',
    description:
      'Abort the in-progress post-creation flow (the multi-turn draft the user was filling out). Does NOT cancel posts that are already scheduled. Call this when the user says "cancel", "never mind", or starts a completely new request.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const pending = await ctx.db.apPendingAction.findUnique({
        where: { organizationId: ctx.org.id },
      });

      if (!pending) {
        return {
          observation: 'No draft in progress — nothing to cancel.',
          data: { cancelled: false },
        };
      }

      await deps.directAction.cancelAction(ctx.org.id);
      ctx.logger.info(
        `cancel_pending_draft: cleared pending=${pending.id} reason="${input.reason ?? '(unspecified)'}"`,
      );

      return {
        observation: 'Cancelled the in-progress draft.',
        data: { cancelled: true },
      };
    },
  };
}
