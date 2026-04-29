/**
 * `list_publish_errors` tool — slice E.6
 *
 * Returns SKIPPED `ApScheduledSlot` rows for the tenant — these represent
 * publishing attempts that fired but could not complete (no integration, empty
 * stack, or an unhandled error). Pure read — LLM narrates.
 *
 * Use when the user asks "what publishing errors do I have?", "show me failed
 * publishes", "why didn't my posts go out?", "list skipped slots".
 * NOT for listing upcoming scheduled posts — use list_scheduled_posts for that.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { formatForUser } from '../../time/parse';

const inputSchema = z.object({
  platform: z
    .string()
    .optional()
    .describe('Filter to one platform slug (e.g. "twitter"). Omit for all.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Max errors to return (1–50). Defaults to 20.'),
  lookbackDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('How many days back to search (1–90). Defaults to 7.'),
});

export type ListPublishErrorsInput = z.infer<typeof inputSchema>;

export interface PublishError {
  slotId: string;
  platform: string;
  scheduledAt: string;
  skipReason: string;
}

export interface ListPublishErrorsOutput {
  count: number;
  errors: PublishError[];
}

export function createListPublishErrorsTool(): OrchestratorTool<
  ListPublishErrorsInput,
  ListPublishErrorsOutput
> {
  return {
    name: 'list_publish_errors',
    description:
      'List recent publishing failures — slots that were skipped because there was no integration, an empty stack, or an unhandled error. Use for "what publishing errors do I have?", "show failed publishes", "why didn\'t my posts go out?". NOT for listing upcoming posts — use list_scheduled_posts for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const limit = input.limit ?? 20;
      const lookbackDays = input.lookbackDays ?? 7;
      const since = new Date(ctx.now.getTime() - lookbackDays * 24 * 60 * 60_000);

      const slots = await ctx.db.apScheduledSlot.findMany({
        where: {
          organizationId: ctx.org.id,
          status: 'SKIPPED',
          scheduledAt: { gte: since },
          ...(input.platform ? { platform: input.platform } : {}),
        },
        orderBy: { scheduledAt: 'desc' },
        take: limit,
      });

      const errors: PublishError[] = slots.map((s) => {
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        return {
          slotId: s.id,
          platform: s.platform,
          scheduledAt: s.scheduledAt.toISOString(),
          skipReason: String(meta['skipReason'] ?? 'unknown'),
        };
      });

      const observation =
        errors.length === 0
          ? `No publishing failures in the last ${lookbackDays} day(s)${input.platform ? ` on ${input.platform}` : ''}.`
          : `Found ${errors.length} publishing failure(s) in the last ${lookbackDays} day(s):\n` +
            errors
              .map(
                (e, i) =>
                  `${i + 1}. [${e.platform}] ${formatForUser(new Date(e.scheduledAt), { now: ctx.now, timezone: ctx.timezone })} — reason: ${e.skipReason} (slot: ${e.slotId})`,
              )
              .join('\n') +
            `\n\nUse retry_publish with a slot ID to reschedule, or quarantine_post to flag a problematic draft.`;

      ctx.logger.info(
        `list_publish_errors: org=${ctx.org.id} lookback=${lookbackDays}d count=${errors.length}`,
      );

      return { observation, data: { count: errors.length, errors } };
    },
  };
}
