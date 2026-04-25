/**
 * `rollback_published_post` tool — roll back one or many published posts
 *
 * Wraps the `rollback_post` skill for each ID in the array.
 * Does NOT remove content from the live platform — user must do that manually.
 * A single rollback is publishedPostIds:["id"] — same code path as batch.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { handleRollback } from '../../skills/rollback_post';
import type { SkillContext } from '../../skills/types';

const inputSchema = z.object({
  publishedPostIds: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe(
      'Array of ApPublishedPost IDs to roll back. Even for one rollback, pass an array: ["id"]. The skill verifies each ID belongs to the calling tenant.',
    ),
  reason: z
    .string()
    .optional()
    .describe('Human-readable reason stored in metadata (default: "user requested via chat").'),
});

export type RollbackPublishedPostInput = z.infer<typeof inputSchema>;

export interface RollbackPublishedPostOutput {
  rolledBack: number;
  skipped: number;
  results: Array<{
    publishedPostId: string;
    ok: boolean;
    platform: string;
    note: string;
  }>;
}

export function createRollbackPublishedPostTool(): OrchestratorTool<
  RollbackPublishedPostInput,
  RollbackPublishedPostOutput
> {
  return {
    name: 'rollback_published_post',
    description:
      'Roll back one or more published posts — soft-deletes the Postiz Post record, marks candidates FAILED, annotates the published-post rows. Does NOT remove content from the live platform. Pass all IDs at once: publishedPostIds:["id1","id2"]. Single rollback: publishedPostIds:["id"].',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const skillCtx: SkillContext = {
        tenant: ctx.org,
        user: ctx.user,
        db: ctx.db as unknown as import('@prisma/client').PrismaClient,
        llm: ctx.llm,
        logger: ctx.logger,
      };

      const results: RollbackPublishedPostOutput['results'] = [];
      let rolledBack = 0;
      let skipped = 0;

      for (const publishedPostId of input.publishedPostIds) {
        const result = await handleRollback(skillCtx, {
          publishedPostId,
          reason: input.reason ?? 'user requested via chat',
        });

        results.push({
          publishedPostId,
          ok: result.rolledBack,
          platform: result.platform,
          note: result.note,
        });

        if (result.rolledBack) {
          rolledBack++;
          ctx.logger.info(`rollback_published_post: id=${publishedPostId} platform=${result.platform}`);
        } else {
          skipped++;
          ctx.logger.warn(`rollback_published_post: skipped id=${publishedPostId} — ${result.note}`);
        }
      }

      const message = rolledBack === 0
        ? `No posts were rolled back (${skipped} skipped — already rolled back or not found).`
        : `Rolled back ${rolledBack} post${rolledBack === 1 ? '' : 's'} in our database${skipped > 0 ? `, ${skipped} skipped` : ''}. NOTE: content may still be live on the platforms — please delete there manually.`;

      ctx.emit({ type: 'action_result', action: 'rollback_published_post', ok: rolledBack > 0, message });

      return {
        observation: message,
        data: { rolledBack, skipped, results },
        emitted: true,
      };
    },
  };
}
