/**
 * `list_writing_prompts` tool — slice E.8
 *
 * Returns all writing-instruction prompts for the tenant (active + inactive).
 * Pure read — LLM narrates. Does NOT return post topics; these are long style
 * guides that shape HOW the copywriter writes.
 *
 * Use when the user asks "show my writing prompts", "what writing instructions
 * are saved?", "list my style guides".
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({});

export type ListWritingPromptsInput = z.infer<typeof inputSchema>;

export interface WritingPromptSummary {
  id: string;
  label: string | null;
  source: string;
  active: boolean;
  ordinal: number;
  snippet: string;
}

export interface ListWritingPromptsOutput {
  prompts: WritingPromptSummary[];
}

export function createListWritingPromptsTool(): OrchestratorTool<
  ListWritingPromptsInput,
  ListWritingPromptsOutput
> {
  return {
    name: 'list_writing_prompts',
    description:
      'List all writing-instruction prompts (style guides) saved for this account — both active and inactive. ' +
      'These are long instruction blocks that shape HOW the copywriter writes (voice, tone, rules), ' +
      'NOT post topic ideas. Use for "show my writing prompts", "what style guides do I have?", ' +
      '"list my writing instructions".',
    parameters: inputSchema,
    handler: async (ctx, _input) => {
      const db = ctx.db as unknown as PrismaClient;

      const rows = await db.apWritingPrompt.findMany({
        where: { organizationId: ctx.org.id },
        orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
      });

      const prompts: WritingPromptSummary[] = rows.map((r) => ({
        id: r.id,
        label: r.label,
        source: r.source,
        active: r.active,
        ordinal: r.ordinal,
        snippet: r.content.length > 120 ? r.content.slice(0, 120) + '…' : r.content,
      }));

      if (prompts.length === 0) {
        ctx.logger.info(`list_writing_prompts: org=${ctx.org.id} none found`);
        return {
          observation: 'No writing prompts are saved yet. Use `add_writing_prompt` to create one.',
          data: { prompts: [] },
        };
      }

      const lines = prompts.map(
        (p, i) =>
          `${i + 1}. [${p.id}] ${p.label ? `"${p.label}" ` : ''}(${p.source}, ${p.active ? 'active' : 'inactive'}, ordinal ${p.ordinal})\n   ${p.snippet}`,
      );

      ctx.logger.info(`list_writing_prompts: org=${ctx.org.id} count=${prompts.length}`);
      return {
        observation: `Writing prompts (${prompts.length}):\n${lines.join('\n')}`,
        data: { prompts },
      };
    },
  };
}
