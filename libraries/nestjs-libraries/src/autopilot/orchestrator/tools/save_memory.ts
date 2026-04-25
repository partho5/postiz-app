/**
 * `save_memory` tool — slice 1.3.f
 *
 * Persists a piece of information to the tenant's vector memory store.
 * Wraps `writeVector` from the memory module — embedding is computed
 * server-side via `AP_OPENAI_API_KEY`.
 *
 * No SSE side-event — the observation text is the confirmation.
 * Returns `emitted: false` (default) so the orchestrator's final reply
 * echoes the confirmation to the user.
 */

import { z } from 'zod';
import { PrismaClient, ApMemoryVectorKind } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { writeVector } from '../../memory';

const VALID_KINDS = [
  'LEARNING',
  'BRAND_RULE',
  'ANECDOTE',
  'PERSONAL_STORY',
  'MILESTONE',
  'COMPETITOR',
] as const;

const inputSchema = z.object({
  content: z
    .string()
    .min(1)
    .describe('The information to store verbatim.'),
  kind: z
    .enum(VALID_KINDS)
    .optional()
    .default('LEARNING')
    .describe(
      'Memory kind. LEARNING = general insight; BRAND_RULE = brand constraint; ANECDOTE = story/example; PERSONAL_STORY = personal narrative; MILESTONE = achievement; COMPETITOR = competitor observation. Default: LEARNING.',
    ),
  freshnessTtlDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Days until this memory expires. Omit for a permanent memory.'),
});

export type SaveMemoryInput = z.infer<typeof inputSchema>;

export interface SaveMemoryOutput {
  memoryId: string | null;
  kind: string;
  content: string;
  saved: boolean;
}

export function createSaveMemoryTool(): OrchestratorTool<SaveMemoryInput, SaveMemoryOutput> {
  return {
    name: 'save_memory',
    description:
      "Save a piece of information to the tenant's long-term memory. Use when the user shares something worth remembering: a brand rule, personal story, competitor observation, key learning, or milestone. The memory becomes available to future orchestrator turns via `recall_memory`.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      const kind: ApMemoryVectorKind = (input.kind ?? 'LEARNING') as ApMemoryVectorKind;
      let memoryId: string | null = null;
      try {
        memoryId = await writeVector(db, ctx.org.id, {
          kind,
          content: input.content,
          freshnessTtlDays: input.freshnessTtlDays ?? null,
          sourceRef: { savedBy: ctx.user.id, tool: 'save_memory' },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`save_memory: writeVector failed: ${message}`);
        return {
          observation: `Could not save to memory: ${message}. (Is AP_OPENAI_API_KEY configured?)`,
          data: { memoryId: null, kind, content: input.content, saved: false },
        };
      }

      ctx.logger.info(
        `save_memory: id=${memoryId} kind=${kind} org=${ctx.org.id}`,
      );

      return {
        observation: `Saved to memory (id: ${memoryId}, kind: ${kind}).`,
        data: { memoryId, kind, content: input.content, saved: true },
      };
    },
  };
}
