/**
 * `quarantine_post` tool — slice E.6
 *
 * Marks a PENDING `ApPostCandidate` as FAILED with `metadata.quarantined = true`
 * so it is permanently excluded from the publishing queue. The candidate stays
 * in the DB for audit purposes but will never be popped by `popTop` again.
 * Emits `action_result`.
 *
 * Use when the user says "quarantine draft <id>", "pull that post from the
 * queue", "flag draft <id> as problematic", "remove that post permanently".
 * NOT for temporary pausing — use pause_posting for that.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  candidateId: z
    .string()
    .describe('The ApPostCandidate ID to quarantine.'),
  reason: z
    .string()
    .optional()
    .describe('Optional reason for quarantine (stored in metadata for audit).'),
});

export type QuarantinePostInput = z.infer<typeof inputSchema>;

export interface QuarantinePostOutput {
  candidateId: string;
  platform: string;
  quarantined: boolean;
}

export function createQuarantinePostTool(): OrchestratorTool<
  QuarantinePostInput,
  QuarantinePostOutput
> {
  return {
    name: 'quarantine_post',
    description:
      'Permanently remove a draft from the publishing queue by marking it as quarantined. Use for "quarantine draft <id>", "pull that post", "flag draft <id> as problematic". NOT for temporary pausing — use pause_posting for that. Emits action_result.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const candidate = await ctx.db.apPostCandidate.findFirst({
        where: { id: input.candidateId, organizationId: ctx.org.id },
      });

      if (!candidate) {
        return {
          observation: `Draft "${input.candidateId}" not found (or does not belong to this account).`,
          data: { candidateId: input.candidateId, platform: '', quarantined: false },
        };
      }

      if (candidate.status !== 'PENDING') {
        return {
          observation: `Draft "${input.candidateId}" has status "${candidate.status}" — only PENDING drafts can be quarantined. Use rollback_published_post for already-published posts.`,
          data: { candidateId: input.candidateId, platform: candidate.platform, quarantined: false },
        };
      }

      const existingMeta = (candidate.metadata ?? {}) as Record<string, unknown>;
      await ctx.db.apPostCandidate.update({
        where: { id: input.candidateId },
        data: {
          status: 'FAILED',
          metadata: {
            ...existingMeta,
            quarantined: true,
            quarantineReason: input.reason ?? 'manual_quarantine',
            quarantinedAt: ctx.now.toISOString(),
            quarantinedBy: ctx.user.id ?? 'user',
          },
        },
      });

      ctx.emit({
        type: 'action_result',
        action: 'quarantine_post',
        ok: true,
        message: `Draft ${input.candidateId} [${candidate.platform}] quarantined and removed from the queue.`,
      });

      ctx.logger.info(
        `quarantine_post: org=${ctx.org.id} candidateId=${input.candidateId} platform=${candidate.platform}`,
      );

      return {
        observation: `Draft "${input.candidateId}" [${candidate.platform}] has been quarantined and will not be published. Reason: ${input.reason ?? 'manual quarantine'}.`,
        data: { candidateId: input.candidateId, platform: candidate.platform, quarantined: true },
        emitted: true,
      };
    },
  };
}
