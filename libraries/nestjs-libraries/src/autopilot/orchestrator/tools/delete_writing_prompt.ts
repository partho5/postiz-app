/**
 * `delete_writing_prompt` tool — slice E.8
 *
 * Hard-deletes a writing-instruction prompt. Guards against unknown promptId
 * (tenant-scoped). Emits `action_result`.
 *
 * Use when the user says "delete writing prompt X", "remove style guide Y".
 * To temporarily disable a prompt without deleting it, use `toggle_writing_prompt`.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  promptId: z.string().describe('ID of the writing prompt to permanently delete.'),
});

export type DeleteWritingPromptInput = z.infer<typeof inputSchema>;

export interface DeleteWritingPromptOutput {
  promptId: string;
  deleted: boolean;
}

export function createDeleteWritingPromptTool(): OrchestratorTool<
  DeleteWritingPromptInput,
  DeleteWritingPromptOutput
> {
  return {
    name: 'delete_writing_prompt',
    description:
      'Permanently delete a writing-instruction prompt. ' +
      'This cannot be undone — use `toggle_writing_prompt` to temporarily disable instead. ' +
      'Use for "delete writing prompt X", "remove style guide Y".',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      const existing = await db.apWritingPrompt.findFirst({
        where: { id: input.promptId, organizationId: ctx.org.id },
      });
      if (!existing) {
        return {
          observation: `Writing prompt ${input.promptId} not found for this account.`,
          data: { promptId: input.promptId, deleted: false },
        };
      }

      await db.apWritingPrompt.delete({ where: { id: input.promptId } });

      ctx.emit({ type: 'action_result', action: 'delete_writing_prompt', ok: true, message: `Writing prompt ${input.promptId} deleted.` });
      ctx.logger.info(`delete_writing_prompt: org=${ctx.org.id} id=${input.promptId}`);

      return {
        observation: `Writing prompt ${input.promptId} has been permanently deleted.`,
        data: { promptId: input.promptId, deleted: true },
        emitted: true,
      };
    },
  };
}
