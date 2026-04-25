/**
 * `get_older_history` tool — slice 1.3.f
 *
 * Fetches chat messages from beyond the current context window (the
 * orchestrator loads the 20 most recent messages by default).  The LLM
 * can call this when the user references a past conversation that is not
 * visible in the current turn.
 *
 * Returns the messages as an observation string the LLM can cite.
 * Pagination: skip the most recent `skipRecent` messages (default 20,
 * matching the context-window size) and return the next `limit` oldest.
 */

import { z } from 'zod';
import { ApChatMessageRole } from '@prisma/client';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  skipRecent: z
    .number()
    .int()
    .min(0)
    .max(200)
    .optional()
    .default(20)
    .describe(
      'Messages to skip from the recent end (default 20, matching the current context window). Use 40 for the second batch, 60 for the third, etc.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe('Number of messages to return (1–50, default 20).'),
});

export type GetOlderHistoryInput = z.infer<typeof inputSchema>;

export interface GetOlderHistoryOutput {
  messages: Array<{ role: string; content: string; createdAt: string }>;
  totalFetched: number;
  skipped: number;
}

export function createGetOlderHistoryTool(): OrchestratorTool<
  GetOlderHistoryInput,
  GetOlderHistoryOutput
> {
  return {
    name: 'get_older_history',
    description:
      "Retrieve older chat messages not visible in the current context window. Use when the user references a past conversation, asks 'what did I say earlier about X', or the current 20-message window isn't enough. Returns messages in chronological order.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const skipRecent = input.skipRecent ?? 20;
      const limit = input.limit ?? 20;

      const rows = await ctx.db.apChatMessage.findMany({
        where: {
          organizationId: ctx.org.id,
          role: {
            in: [ApChatMessageRole.USER, ApChatMessageRole.ASSISTANT],
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: skipRecent,
        take: limit,
        select: { role: true, content: true, createdAt: true },
      });

      const messages = rows
        .reverse()
        .map((r) => ({
          role: r.role === ApChatMessageRole.USER ? 'user' : 'assistant',
          content: r.content,
          createdAt: r.createdAt.toISOString(),
        }));

      if (messages.length === 0) {
        return {
          observation: `No older messages found (skipped=${skipRecent}).`,
          data: { messages: [], totalFetched: 0, skipped: skipRecent },
        };
      }

      const lines = messages.map(
        (m) => `[${m.createdAt.slice(0, 16).replace('T', ' ')}] ${m.role}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '…' : ''}`,
      );

      ctx.logger.info(
        `get_older_history: fetched ${messages.length} msgs (skip=${skipRecent}) org=${ctx.org.id}`,
      );

      return {
        observation: `Older history (${messages.length} messages, skipped ${skipRecent}):\n${lines.join('\n')}`,
        data: { messages, totalFetched: messages.length, skipped: skipRecent },
      };
    },
  };
}
