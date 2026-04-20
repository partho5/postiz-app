/**
 * Stack primitives — slice 2.2
 *
 * Four operations over the ap_post_candidate table:
 *
 *   push(db, tenantId, platform, content, options?)
 *     Creates a PENDING candidate in the stack.
 *
 *   popTop(db, tenantId, platform)
 *     Atomically claims the highest-priority non-expired PENDING candidate and
 *     sets its status to RESERVED.  Uses SELECT … FOR UPDATE SKIP LOCKED inside
 *     a transaction so that two concurrent callers never receive the same row.
 *     Returns null when the stack is empty or all candidates are expired.
 *
 *   expire(db, tenantId?)
 *     Bulk-transitions PENDING candidates whose expiresAt is in the past to
 *     EXPIRED.  Pass tenantId to scope to one tenant; omit for all tenants
 *     (used by the sweeper cron in slice 2.9).
 *     Returns the number of rows affected.
 *
 *   depth(db, tenantId, platform?)
 *     Count of PENDING non-expired candidates for a tenant.
 *     Pass platform to narrow to a single channel.
 */

import { PrismaClient, ApPostCandidate, ApPostCandidateStatus, Prisma } from '@prisma/client';

export { ApPostCandidateStatus };
export type { ApPostCandidate };

// ---------------------------------------------------------------------------
// Push options
// ---------------------------------------------------------------------------

export interface PushOptions {
  /** Higher priority pops first; default 0. */
  priority?: number;
  /** Human-readable creator tag, e.g. 'copywriter_agent' or 'user'. */
  source?: string;
  /** Absolute expiry — candidate will be skipped / expired after this time. */
  expiresAt?: Date;
  /** Array of media URLs to attach. */
  mediaUrls?: string[];
  /** Per-platform content variants produced by the fan-out agent. */
  contentVariants?: Record<string, unknown>;
  /** Arbitrary extra data. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

/**
 * Adds a new PENDING candidate to the stack for (tenantId, platform).
 */
export async function push(
  db: PrismaClient,
  tenantId: string,
  platform: string,
  content: string,
  options?: PushOptions
): Promise<ApPostCandidate> {
  return db.apPostCandidate.create({
    data: {
      organizationId: tenantId,
      platform,
      content,
      priority: options?.priority ?? 0,
      source: options?.source ?? 'unknown',
      expiresAt: options?.expiresAt ?? null,
      mediaUrls: options?.mediaUrls ?? [],
      contentVariants: (options?.contentVariants ?? {}) as Prisma.InputJsonValue,
      metadata: (options?.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

// ---------------------------------------------------------------------------
// popTop
// ---------------------------------------------------------------------------

/**
 * Atomically claims the top-of-stack candidate.
 *
 * Selection order: priority DESC, createdAt ASC (oldest high-priority first).
 * Only PENDING candidates that are not yet expired are eligible.
 *
 * Uses SELECT … FOR UPDATE SKIP LOCKED so concurrent callers each get a
 * distinct row without blocking each other.
 *
 * Returns null when the stack is empty.
 */
export async function popTop(
  db: PrismaClient,
  tenantId: string,
  platform: string
): Promise<ApPostCandidate | null> {
  return db.$transaction(async (tx) => {
    // Lock one row with SKIP LOCKED — concurrent pops won't race on the same row.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ap_post_candidate"
      WHERE "organizationId" = ${tenantId}
        AND platform = ${platform}
        AND status = 'PENDING'::"ApPostCandidateStatus"
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      ORDER BY priority DESC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (locked.length === 0) return null;

    return tx.apPostCandidate.update({
      where: { id: locked[0].id },
      data: { status: ApPostCandidateStatus.RESERVED },
    });
  });
}

// ---------------------------------------------------------------------------
// expire
// ---------------------------------------------------------------------------

/**
 * Marks all PENDING candidates whose expiresAt is in the past as EXPIRED.
 *
 * Pass tenantId to scope to a single tenant; omit for a global sweep.
 * Returns the number of rows transitioned.
 */
export async function expire(
  db: PrismaClient,
  tenantId?: string
): Promise<number> {
  const result = await db.apPostCandidate.updateMany({
    where: {
      ...(tenantId ? { organizationId: tenantId } : {}),
      status: ApPostCandidateStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: { status: ApPostCandidateStatus.EXPIRED },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// depth
// ---------------------------------------------------------------------------

/**
 * Returns the number of PENDING, non-expired candidates in the stack.
 *
 * Pass platform to narrow the count to a single channel.
 */
export async function depth(
  db: PrismaClient,
  tenantId: string,
  platform?: string
): Promise<number> {
  return db.apPostCandidate.count({
    where: {
      organizationId: tenantId,
      ...(platform ? { platform } : {}),
      status: ApPostCandidateStatus.PENDING,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}
