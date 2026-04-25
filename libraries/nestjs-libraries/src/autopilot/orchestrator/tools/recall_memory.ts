/**
 * `recall_memory` tool — slice 1.3.f
 *
 * Performs a semantic nearest-neighbour search over the tenant's vector
 * memory store.  Wraps `queryVector` from the memory module.
 *
 * Returns top-K results as a compact observation string the LLM can cite
 * in its reply.  No SSE side-event; the orchestrator echoes the reply text.
 */

import { z } from 'zod';
import { PrismaClient, ApMemoryVectorKind } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { queryVector } from '../../memory';

const VALID_KINDS = [
  'LEARNING',
  'BRAND_RULE',
  'ANECDOTE',
  'PERSONAL_STORY',
  'MILESTONE',
  'COMPETITOR',
] as const;

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Text to search for semantically in memory.'),
  kinds: z
    .array(z.enum(VALID_KINDS))
    .optional()
    .describe('Optional filter — only return memories of these kinds. Omit to search all kinds.'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum number of results to return (1–10, default 5).'),
});

export type RecallMemoryInput = z.infer<typeof inputSchema>;

export interface RecallMemoryResult {
  id: string;
  kind: string;
  content: string;
  similarity: number | undefined;
}

export interface RecallMemoryOutput {
  results: RecallMemoryResult[];
  query: string;
  recalled: boolean;
}

export function createRecallMemoryTool(): OrchestratorTool<RecallMemoryInput, RecallMemoryOutput> {
  return {
    name: 'recall_memory',
    description:
      "Search the tenant's long-term memory for information relevant to a query. Use when the user asks about past decisions, stored rules, brand notes, or anything you might have saved. Returns the most semantically similar memories.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;
      const topK = input.topK ?? 5;
      const kinds = input.kinds as ApMemoryVectorKind[] | undefined;

      let rows: Awaited<ReturnType<typeof queryVector>>;
      try {
        rows = await queryVector(db, ctx.org.id, input.query, topK, kinds);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`recall_memory: queryVector failed: ${message}`);
        return {
          observation: `Could not search memory: ${message}. (Is AP_OPENAI_API_KEY configured?)`,
          data: { results: [], query: input.query, recalled: false },
        };
      }

      if (rows.length === 0) {
        return {
          observation: `No memories found for query "${input.query}"${kinds ? ` (kinds: ${kinds.join(', ')})` : ''}.`,
          data: { results: [], query: input.query, recalled: true },
        };
      }

      const lines = rows.map((r, i) => {
        const score =
          r.similarity !== undefined
            ? ` [similarity: ${r.similarity.toFixed(3)}]`
            : '';
        return `${i + 1}. [${r.kind}]${score} ${r.content}`;
      });

      ctx.logger.info(
        `recall_memory: found ${rows.length} results for query="${input.query}" org=${ctx.org.id}`,
      );

      return {
        observation: `Found ${rows.length} memories:\n${lines.join('\n')}`,
        data: {
          results: rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            content: r.content,
            similarity: r.similarity,
          })),
          query: input.query,
          recalled: true,
        },
      };
    },
  };
}
