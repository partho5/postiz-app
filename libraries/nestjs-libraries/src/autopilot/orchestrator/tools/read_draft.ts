/**
 * `read_draft` tool — slice E.3
 *
 * Returns one ApPostCandidate by ID with full content and metadata.
 * Pure read — LLM narrates. Use when the user asks "show me draft <id>",
 * "what's the content of that draft?", "read draft abc123".
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  id: z.string().describe('The draft ID (ApPostCandidate.id) to read.'),
});

export type ReadDraftInput = z.infer<typeof inputSchema>;

export interface ReadDraftOutput {
  found: boolean;
  draft?: {
    id: string;
    platform: string;
    content: string;
    status: string;
    source: string;
    priority: number;
    expiresAt: string | null;
    createdAt: string;
    metadata: unknown;
  };
}

export function createReadDraftTool(): OrchestratorTool<ReadDraftInput, ReadDraftOutput> {
  return {
    name: 'read_draft',
    description:
      'Read the full content and metadata of a single draft by its ID. Use when the user says "show me draft <id>" or "what\'s in that draft?".',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const row = await ctx.db.apPostCandidate.findFirst({
        where: { id: input.id, organizationId: ctx.org.id },
      });

      if (!row) {
        return {
          observation: `Draft "${input.id}" not found (or does not belong to this account).`,
          data: { found: false },
        };
      }

      const draft = {
        id: row.id,
        platform: row.platform,
        content: row.content,
        status: row.status,
        source: row.source,
        priority: row.priority,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        metadata: row.metadata,
      };

      ctx.logger.info(`read_draft: org=${ctx.org.id} id=${input.id} status=${row.status}`);

      return {
        observation: `Draft ${row.id} [${row.platform}] (${row.status}):\n${row.content}`,
        data: { found: true, draft },
      };
    },
  };
}
