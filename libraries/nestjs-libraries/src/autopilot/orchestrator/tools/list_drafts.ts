/**
 * `list_drafts` tool — slice E.3
 *
 * Lists PENDING ApPostCandidate rows (the autopilot draft queue) for the tenant.
 * Pure read — LLM narrates. No emitted UI card.
 *
 * Use when the user asks "show my drafts", "what's in my queue?",
 * "list pending posts", "how many drafts do I have?".
 * NOT for listing already-scheduled (slot-assigned) posts — use list_scheduled_posts.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  platform: z.string().optional().describe('Filter to one platform slug. Omit for all.'),
  limit: z.number().int().min(1).max(50).optional().describe('Max drafts to return (default 20).'),
});

export type ListDraftsInput = z.infer<typeof inputSchema>;

export interface DraftSummary {
  id: string;
  platform: string;
  contentSnippet: string;
  source: string;
  priority: number;
  createdAt: string;
}

export interface ListDraftsOutput {
  count: number;
  drafts: DraftSummary[];
}

export function createListDraftsTool(): OrchestratorTool<ListDraftsInput, ListDraftsOutput> {
  return {
    name: 'list_drafts',
    description:
      'List the pending draft posts in the autopilot queue. Use for "show my drafts", "what\'s in my queue?", "list pending posts". NOT for already-scheduled posts — use list_scheduled_posts for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const limit = input.limit ?? 20;

      const rows = await ctx.db.apPostCandidate.findMany({
        where: {
          organizationId: ctx.org.id,
          status: 'PENDING',
          ...(input.platform ? { platform: input.platform } : {}),
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: limit,
      });

      const drafts: DraftSummary[] = rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        contentSnippet: r.content.slice(0, 80) + (r.content.length > 80 ? '…' : ''),
        source: r.source,
        priority: r.priority,
        createdAt: r.createdAt.toISOString(),
      }));

      const observation =
        drafts.length === 0
          ? input.platform
            ? `No pending ${input.platform} drafts in the queue.`
            : 'No pending drafts in the queue.'
          : `Found ${drafts.length} pending draft(s):\n` +
            drafts
              .map((d, i) => `${i + 1}. [${d.platform}] "${d.contentSnippet}" (id: ${d.id})`)
              .join('\n');

      ctx.logger.info(`list_drafts: org=${ctx.org.id} count=${drafts.length}`);

      return { observation, data: { count: drafts.length, drafts } };
    },
  };
}
