/**
 * `edit_draft` tool — slice E.3
 *
 * Updates the content of a PENDING ApPostCandidate. Guards non-PENDING
 * candidates (RESERVED, PUBLISHED, etc. cannot be edited).
 * Emits action_result.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  id: z.string().describe('The draft ID to edit.'),
  content: z.string().min(1).describe('The new post content to replace the existing draft.'),
});

export type EditDraftInput = z.infer<typeof inputSchema>;

export interface EditDraftOutput {
  updated: boolean;
  id: string;
}

export function createEditDraftTool(): OrchestratorTool<EditDraftInput, EditDraftOutput> {
  return {
    name: 'edit_draft',
    description:
      'Edit (overwrite) the content of a pending draft. Only PENDING drafts can be edited. Use when the user says "change the text of draft <id> to…", "edit that draft".',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const row = await ctx.db.apPostCandidate.findFirst({
        where: { id: input.id, organizationId: ctx.org.id },
      });

      if (!row) {
        return {
          observation: `Draft "${input.id}" not found.`,
          data: { updated: false, id: input.id },
        };
      }

      if (row.status !== 'PENDING') {
        return {
          observation: `Draft "${input.id}" is ${row.status} and cannot be edited.`,
          data: { updated: false, id: input.id },
        };
      }

      await ctx.db.apPostCandidate.update({
        where: { id: input.id },
        data: { content: input.content },
      });

      const message = `Updated draft ${input.id}.`;
      ctx.emit({ type: 'action_result', action: 'edit_draft', ok: true, message });
      ctx.logger.info(`edit_draft: org=${ctx.org.id} id=${input.id}`);

      return {
        observation: message,
        data: { updated: true, id: input.id },
        emitted: true,
      };
    },
  };
}
