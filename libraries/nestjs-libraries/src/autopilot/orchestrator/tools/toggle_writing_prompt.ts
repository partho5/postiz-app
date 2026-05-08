/**
 * `toggle_writing_prompt` tool — slice E.8
 *
 * Flips the `active` flag on a writing-instruction prompt. Inactive prompts
 * are not injected into the copywriter but are not deleted. Emits
 * `action_result`.
 *
 * Use when the user says "disable prompt X", "enable prompt Y", "turn off
 * my VC voice style guide". Prefer this over delete when the user wants to
 * temporarily stop using a prompt.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  promptId: z.string().describe('ID of the writing prompt to enable or disable.'),
  active: z.boolean().describe('true to activate, false to deactivate.'),
});

export type ToggleWritingPromptInput = z.infer<typeof inputSchema>;

export interface ToggleWritingPromptOutput {
  promptId: string;
  active: boolean;
}

export function createToggleWritingPromptTool(): OrchestratorTool<
  ToggleWritingPromptInput,
  ToggleWritingPromptOutput
> {
  return {
    name: 'toggle_writing_prompt',
    description:
      'Enable or disable a writing-instruction prompt without deleting it. ' +
      'Inactive prompts are skipped by the copywriter but can be re-enabled later. ' +
      'Use for "disable prompt X", "enable prompt Y", "turn off my style guide". ' +
      'Use `delete_writing_prompt` only when the prompt should be removed permanently.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      const existing = await db.apWritingPrompt.findFirst({
        where: { id: input.promptId, organizationId: ctx.org.id },
      });
      if (!existing) {
        return {
          observation: `Writing prompt ${input.promptId} not found for this account.`,
          data: { promptId: input.promptId, active: input.active },
        };
      }

      await db.apWritingPrompt.update({
        where: { id: input.promptId },
        data: { active: input.active },
      });

      const verb = input.active ? 'activated' : 'deactivated';
      ctx.emit({ type: 'action_result', action: 'toggle_writing_prompt', ok: true, message: `Writing prompt ${input.promptId} ${verb}.` });
      ctx.logger.info(`toggle_writing_prompt: org=${ctx.org.id} id=${input.promptId} active=${input.active}`);

      return {
        observation: `Writing prompt ${input.promptId} has been ${verb}. ${input.active ? 'It will now be injected into the copywriter.' : 'It will no longer be injected into the copywriter.'}`,
        data: { promptId: input.promptId, active: input.active },
        emitted: true,
      };
    },
  };
}
