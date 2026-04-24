/**
 * `list_scheduled_posts` tool — slice 1.3.c
 *
 * Returns the upcoming pending posts queued for the tenant. Pushes a
 * structured `scheduled_list` SSE event so the frontend can render a
 * proper list bubble (slice 1.3.g), and returns a compact text summary
 * as the LLM's observation so it can compose a reply or chain into
 * `cancel_scheduled_post` / `reschedule_post` (slice 1.3.d).
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { formatForUser } from '../../time/parse';

const inputSchema = z.object({
  platform: z
    .string()
    .optional()
    .describe('Filter to one platform slug (e.g. "linkedin"). Omit for all.'),
  daysAhead: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe(
      'How many days into the future to look. Defaults to 14 if omitted.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Max number of slots to return. Defaults to 20 if omitted.'),
});

export type ListScheduledPostsInput = z.infer<typeof inputSchema>;

export interface ListScheduledPostsOutput {
  count: number;
  posts: Array<{
    id: string;
    platform: string;
    content: string;
    scheduledAt: string;
    status: string;
  }>;
}

export function createListScheduledPostsTool(): OrchestratorTool<
  ListScheduledPostsInput,
  ListScheduledPostsOutput
> {
  return {
    name: 'list_scheduled_posts',
    description:
      'List the user\'s upcoming scheduled posts (pending, not yet published). Optionally filter by platform or how far ahead to look. Use when the user asks "what\'s scheduled?", "what goes out this week?", "show my queue", etc.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const daysAhead = input.daysAhead ?? 14;
      const limit = input.limit ?? 20;
      const horizon = new Date(
        ctx.now.getTime() + daysAhead * 24 * 60 * 60_000,
      );

      const slots = await ctx.db.apScheduledSlot.findMany({
        where: {
          organizationId: ctx.org.id,
          status: 'PENDING',
          scheduledAt: { gte: ctx.now, lte: horizon },
          ...(input.platform ? { platform: input.platform } : {}),
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
        include: {
          postCandidate: {
            select: { content: true },
          },
        },
      });

      const posts = slots.map((s) => ({
        id: s.id,
        platform: s.platform,
        content: s.postCandidate?.content ?? '',
        scheduledAt: s.scheduledAt.toISOString(),
        status: s.status,
      }));

      ctx.emit({
        type: 'scheduled_list',
        posts,
      });

      const observation = posts.length
        ? `Found ${posts.length} upcoming post(s) in the next ${daysAhead} day(s):\n` +
          posts
            .map(
              (p, i) =>
                `${i + 1}. [${p.platform}] ${formatForUser(new Date(p.scheduledAt), { now: ctx.now, timezone: ctx.timezone })} — "${truncate(p.content, 60)}"`,
            )
            .join('\n')
        : input.platform
          ? `No scheduled ${input.platform} posts in the next ${daysAhead} day(s).`
          : `Nothing scheduled in the next ${daysAhead} day(s).`;

      return {
        observation,
        data: { count: posts.length, posts },
        emitted: true,
      };
    },
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
