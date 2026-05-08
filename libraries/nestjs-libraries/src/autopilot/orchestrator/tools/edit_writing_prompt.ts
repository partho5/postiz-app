/**
 * `edit_writing_prompt` tool — slice E.8
 *
 * Partial update of an existing writing-instruction prompt: content, label,
 * and/or ordinal. Guards against unknown promptId (tenant-scoped lookup).
 * Emits `action_result`.
 *
 * Use when the user says "update writing prompt X", "change the label of
 * prompt Y", "reorder my prompts".
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  promptId: z.string().describe('ID of the writing prompt to update.'),
  content: z.string().optional().describe('New full text for the prompt.'),
  label: z.string().optional().describe('New human-readable label.'),
  ordinal: z
    .number()
    .int()
    .optional()
    .describe('New injection order (ascending). Lower values are injected first.'),
});

export type EditWritingPromptInput = z.infer<typeof inputSchema>;

export interface EditWritingPromptOutput {
  promptId: string;
}

export function createEditWritingPromptTool(): OrchestratorTool<
  EditWritingPromptInput,
  EditWritingPromptOutput
> {
  return {
    name: 'edit_writing_prompt',
    description:
      'Update an existing writing-instruction prompt: change its content, label, or injection order (ordinal). ' +
      'Accepts a partial update — supply only the fields to change. ' +
      'Use for "update writing prompt X", "rename prompt Y", "change the style guide content".',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      const existing = await db.apWritingPrompt.findFirst({
        where: { id: input.promptId, organizationId: ctx.org.id },
      });
      if (!existing) {
        return {
          observation: `Writing prompt ${input.promptId} not found for this account.`,
          data: { promptId: input.promptId },
        };
      }

      const updateData: Record<string, unknown> = {};
      if (input.content !== undefined) updateData['content'] = input.content.trim();
      if (input.label !== undefined) updateData['label'] = input.label;
      if (input.ordinal !== undefined) updateData['ordinal'] = input.ordinal;

      if (Object.keys(updateData).length === 0) {
        return {
          observation: `No fields to update for writing prompt ${input.promptId}.`,
          data: { promptId: input.promptId },
        };
      }

      await db.apWritingPrompt.update({
        where: { id: input.promptId },
        data: updateData,
      });

      ctx.emit({ type: 'action_result', action: 'edit_writing_prompt', ok: true, message: `Writing prompt ${input.promptId} updated.` });
      ctx.logger.info(`edit_writing_prompt: org=${ctx.org.id} id=${input.promptId}`);

      return {
        observation: `Writing prompt ${input.promptId} updated successfully.`,
        data: { promptId: input.promptId },
        emitted: true,
      };
    },
  };
}
