/**
 * Rollback post skill — slice 4.2
 *
 * Marks an autopilot-published post as rolled back.  Three DB mutations run
 * atomically in one Prisma transaction:
 *
 *  1. Soft-delete the Postiz `Post` row (sets `deletedAt = now()`).
 *  2. Mark the `ApPostCandidate` as FAILED (with rollback metadata).
 *  3. Annotate the `ApPublishedPost` metadata with rollback details.
 *
 * Important: This skill does NOT retract the content from the live social
 * media platform.  Postiz's integration abstraction has no provider-level
 * `delete()` method, so platform-side deletion must be done manually.
 * `platformDeleted` is always `false` in the output.
 *
 * Dependencies (verified against actual source files):
 *   ApPostCandidateStatus, ApPublishedPost — @prisma/client
 *   SkillEntry, SkillContext              — skills/types.ts
 */

import { ApPostCandidateStatus, PrismaClient } from '@prisma/client';
import type { SkillEntry, SkillContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RollbackPostInput {
  /**
   * The `ApPublishedPost.id` to roll back.
   * The skill verifies this belongs to the calling tenant.
   */
  publishedPostId: string;
  /**
   * Human-readable reason stored in metadata for auditability.
   * Defaults to 'manual rollback'.
   */
  reason?: string;
}

export interface RollbackPostOutput {
  publishedPostId: string;
  postizPostId: string;
  platform: string;
  /**
   * `true` when all DB mutations completed successfully.
   * `false` when the record was not found or an error occurred.
   */
  rolledBack: boolean;
  /**
   * Always `false` — Postiz provides no provider-level delete API.
   * Platform content must be retracted manually via the platform UI/API.
   */
  platformDeleted: boolean;
  /** Human-readable note (success confirmation or error description). */
  note: string;
}

// ---------------------------------------------------------------------------
// Skill handler
// ---------------------------------------------------------------------------

/**
 * Roll back an autopilot-published post.
 *
 * Idempotent: if `ApPublishedPost.metadata.rolledBack === true`, returns
 * success immediately without running the transaction a second time.
 *
 * Tenant isolation: the `ApPublishedPost` row is looked up with
 * `organizationId = tenant.id` — callers from other tenants receive a
 * not-found error, not a tenant mismatch, to avoid leaking existence info.
 */
export async function handleRollback(
  ctx: SkillContext,
  input: RollbackPostInput,
): Promise<RollbackPostOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;
  const reason = input.reason ?? 'manual rollback';
  const rollbackAt = new Date().toISOString();

  // 1. Load the published post — scoped to tenant for isolation.
  const publishedPost = await db.apPublishedPost.findFirst({
    where: {
      id: input.publishedPostId,
      organizationId: tenantId,
    },
  });

  if (!publishedPost) {
    return {
      publishedPostId: input.publishedPostId,
      postizPostId: '',
      platform: '',
      rolledBack: false,
      platformDeleted: false,
      note: `ApPublishedPost "${input.publishedPostId}" not found for this tenant.`,
    };
  }

  // 2. Idempotency guard — already rolled back.
  const existingMeta = (publishedPost.metadata as Record<string, unknown>) ?? {};
  if (existingMeta.rolledBack === true) {
    return {
      publishedPostId: publishedPost.id,
      postizPostId: publishedPost.postizPostId,
      platform: publishedPost.platform,
      rolledBack: true,
      platformDeleted: false,
      note: 'Already rolled back (idempotent).',
    };
  }

  // 3. Run all mutations atomically.
  try {
    await db.$transaction(async (tx) => {
      // 3a. Soft-delete the Postiz Post row.
      //     updateMany is used so it's idempotent (already-deleted rows pass silently).
      await tx.post.updateMany({
        where: {
          id: publishedPost.postizPostId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // 3b. Fetch current candidate metadata so we can merge, not overwrite.
      const candidate = await tx.apPostCandidate.findUnique({
        where: { id: publishedPost.postCandidateId },
        select: { metadata: true },
      });

      const candidateMeta =
        (candidate?.metadata as Record<string, unknown>) ?? {};

      await tx.apPostCandidate.update({
        where: { id: publishedPost.postCandidateId },
        data: {
          status: ApPostCandidateStatus.FAILED,
          metadata: {
            ...candidateMeta,
            rolledBack: true,
            rollbackReason: reason,
            rollbackAt,
          },
        },
      });

      // 3c. Annotate the ApPublishedPost metadata.
      await tx.apPublishedPost.update({
        where: { id: publishedPost.id },
        data: {
          metadata: {
            ...existingMeta,
            rolledBack: true,
            rollbackReason: reason,
            rollbackAt,
          },
        },
      });
    });

    ctx.logger.info(
      `[rollback_post] rolled back published post ${publishedPost.id} (platform: ${publishedPost.platform}, reason: ${reason})`,
    );

    return {
      publishedPostId: publishedPost.id,
      postizPostId: publishedPost.postizPostId,
      platform: publishedPost.platform,
      rolledBack: true,
      platformDeleted: false,
      note:
        'Rolled back in DB. The post may still be live on the platform — retract it manually via the platform UI or API.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(
      `[rollback_post] transaction failed for published post ${publishedPost.id}: ${message}`,
    );

    return {
      publishedPostId: publishedPost.id,
      postizPostId: publishedPost.postizPostId,
      platform: publishedPost.platform,
      rolledBack: false,
      platformDeleted: false,
      note: `Rollback failed: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// SkillEntry
// ---------------------------------------------------------------------------

export const rollbackPostSkill: SkillEntry<RollbackPostInput, RollbackPostOutput> = {
  id: 'rollback_post',
  description:
    'Roll back an autopilot-published post: soft-deletes the Postiz Post record, marks the candidate FAILED, and annotates the published-post row with rollback metadata. Does not retract live platform content (no provider-level delete API exists).',
  handler: handleRollback,
};

export default rollbackPostSkill;
