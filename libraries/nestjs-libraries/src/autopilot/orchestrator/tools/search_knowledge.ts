/**
 * `search_knowledge` tool — slice 1.3.g
 *
 * Semantic search over the global ap_knowledge_chunk table.
 * Used by the orchestrator when the user asks about capabilities,
 * how a feature works, or any product FAQ.
 *
 * Only returns chunks with cosine similarity >= SCORE_THRESHOLD so the
 * model never gets noisy/irrelevant context. Returns empty when nothing
 * is close enough rather than forcing a low-quality answer.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { embedText } from '../../llm';

const SCORE_THRESHOLD = 0.75;
const DEFAULT_TOP_K = 4;

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'The question or topic to search for in the knowledge base. Use the user\'s exact words or a close paraphrase.',
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .default(DEFAULT_TOP_K)
    .describe('Maximum number of chunks to return (1–8, default 4).'),
});

export type SearchKnowledgeInput = z.infer<typeof inputSchema>;

export interface KnowledgeChunkResult {
  sourceFile: string;
  heading: string;
  content: string;
  similarity: number;
}

export interface SearchKnowledgeOutput {
  results: KnowledgeChunkResult[];
  query: string;
  found: boolean;
}

interface RawChunkRow {
  sourceFile: string;
  heading: string;
  content: string;
  similarity: number;
}

export function createSearchKnowledgeTool(): OrchestratorTool<SearchKnowledgeInput, SearchKnowledgeOutput> {
  return {
    name: 'search_knowledge',
    description:
      'Search the product knowledge base for information about autopilot capabilities, how features work, FAQs, and supported actions. Call this when the user asks what you can do, how something works, or whether a feature exists. Do NOT use this for user-specific data (use recall_memory instead).',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;
      const topK = input.topK ?? DEFAULT_TOP_K;

      let embedding: number[];
      try {
        embedding = await embedText(input.query);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`search_knowledge: embedText failed: ${message}`);
        return {
          observation: `Could not search knowledge base: ${message}. (Is AP_OPENAI_API_KEY configured?)`,
          data: { results: [], query: input.query, found: false },
        };
      }

      const embeddingLiteral = `[${embedding.join(',')}]`;

      let rows: RawChunkRow[];
      try {
        rows = await (db as PrismaClient).$queryRawUnsafe<RawChunkRow[]>(
          `
          SELECT
            "sourceFile",
            heading,
            content,
            (1 - (embedding <=> $1::vector)) AS similarity
          FROM ap_knowledge_chunk
          WHERE (1 - (embedding <=> $1::vector)) >= $2
          ORDER BY embedding <=> $1::vector
          LIMIT $3
          `,
          embeddingLiteral,
          SCORE_THRESHOLD,
          topK,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.logger.warn(`search_knowledge: query failed: ${message}`);
        return {
          observation: `Knowledge base query failed: ${message}`,
          data: { results: [], query: input.query, found: false },
        };
      }

      if (rows.length === 0) {
        ctx.logger.info(`search_knowledge: no results above threshold for query="${input.query}"`);
        return {
          observation: `No relevant knowledge found for "${input.query}". Answer from your general understanding of the product, or tell the user you are not sure.`,
          data: { results: [], query: input.query, found: false },
        };
      }

      const lines = rows.map((r, i) => {
        const score = r.similarity.toFixed(3);
        return `${i + 1}. [${r.sourceFile} § ${r.heading}] (score: ${score})\n${r.content}`;
      });

      ctx.logger.info(
        `search_knowledge: ${rows.length} result(s) for query="${input.query}"`,
      );

      return {
        observation: `Knowledge base results for "${input.query}":\n\n${lines.join('\n\n')}`,
        data: {
          results: rows.map((r) => ({
            sourceFile: r.sourceFile,
            heading: r.heading,
            content: r.content,
            similarity: Number(r.similarity),
          })),
          query: input.query,
          found: true,
        },
      };
    },
  };
}
