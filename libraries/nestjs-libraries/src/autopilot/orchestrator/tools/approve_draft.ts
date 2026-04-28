/**
 * `approve_draft` tool — slice E.3
 *
 * Marks a PENDING draft as human-approved by boosting its priority to 100
 * and stamping metadata.approved_at. The higher priority ensures it is
 * popped before unreviewed drafts in the next publish cycle.
 * Emits action_result.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const APPROVED_PRIORITY = 100;

const inputSchema = z.object({
  id: z.string().describe('The draft ID to approve.'),
});

export type ApproveDraftInput = z.infer<typeof inputSchema>;

export interface ApproveDraftOutput {
  approved: boolean;
  id: string;
}

export function createApproveDraftTool(): OrchestratorTool<ApproveDraftInput, ApproveDraftOutput> {
  return {
    name: 'approve_draft',
    description:
      'Approve a pending draft: marks it as human-reviewed and bumps its priority so it publishes next. Only works on PENDING drafts. Use when the user says "approve draft <id>", "this one looks good, approve it".',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const row = await ctx.db.apPostCandidate.findFirst({
        where: { id: input.id, organizationId: ctx.org.id },
      });

      if (!row) {
        return {
          observation: `Draft "${input.id}" not found.`,
          data: { approved: false, id: input.id },
        };
      }

      if (row.status !== 'PENDING') {
        return {
          observation: `Draft "${input.id}" is ${row.status} — only PENDING drafts can be approved.`,
          data: { approved: false, id: input.id },
        };
      }

      await ctx.db.apPostCandidate.update({
        where: { id: input.id },
        data: {
          priority: APPROVED_PRIORITY,
          metadata: {
            ...(row.metadata as object),
            approved_by: 'user',
            approved_at: ctx.now.toISOString(),
          },
        },
      });

      const message = `Approved draft ${input.id} — it will publish next.`;
      ctx.emit({ type: 'action_result', action: 'approve_draft', ok: true, message });
      ctx.logger.info(`approve_draft: org=${ctx.org.id} id=${input.id}`);

      return {
        observation: message,
        data: { approved: true, id: input.id },
        emitted: true,
      };
    },
  };
}
