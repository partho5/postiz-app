/**
 * EvergreenPoolService — slice 2.11
 *
 * Manages a permanent fallback content pool for each (tenant, platform) pair.
 * When the regular post-candidate stack is empty, PopAndPublishService calls
 * `pickFallback()` to obtain a usable candidate without depleting the pool.
 *
 * Pool invariants
 * ───────────────
 * Evergreen candidates are ordinary `ApPostCandidate` rows distinguished by:
 *   source    = 'evergreen'
 *   expiresAt = null         → immune to the stale sweeper (slice 2.9)
 *   priority  = -1           → lower than regular candidates (priority ≥ 0)
 *                              so popTop() always prefers regular content
 *
 * Pool size stability
 * ───────────────────
 * `pickFallback()` atomically:
 *   1. Finds the oldest PENDING evergreen candidate (FOR UPDATE SKIP LOCKED).
 *   2. Marks it RESERVED  (so it can flow through the normal publish pipeline).
 *   3. Immediately inserts a fresh PENDING clone of it.
 *
 * This keeps pool count constant: one row goes out (RESERVED → later PUBLISHED),
 * one row comes in (fresh PENDING clone).  The pool never runs dry as long as at
 * least one evergreen item was seeded.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ApPostCandidate, ApPostCandidateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// ---------------------------------------------------------------------------
// SeedOptions — a subset of PushOptions relevant for evergreen entries
// ---------------------------------------------------------------------------

export interface SeedEvergreenOptions {
  /** Priority relative to other evergreen items; defaults to -1. */
  priority?: number;
  /** Per-platform content variants (future fan-out). */
  contentVariants?: Record<string, unknown>;
  /** Media URLs to attach. */
  mediaUrls?: string[];
  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class EvergreenPoolService {
  private readonly logger = new Logger(EvergreenPoolService.name);

  constructor(private readonly _prisma: PrismaService) {}

  // ─── seedEvergreen ────────────────────────────────────────────────────────

  /**
   * Add a new entry to the evergreen fallback pool.
   *
   * Enforces `source='evergreen'` and `expiresAt=null` regardless of what is
   * passed in `options`.  Priority defaults to -1 so that `popTop()` (which
   * orders by `priority DESC`) always drains regular candidates first.
   */
  async seedEvergreen(
    tenantId: string,
    platform: string,
    content: string,
    options?: SeedEvergreenOptions,
  ): Promise<ApPostCandidate> {
    const candidate = await this._prisma.apPostCandidate.create({
      data: {
        organizationId: tenantId,
        platform,
        content,
        source: 'evergreen',
        expiresAt: null,
        priority: options?.priority ?? -1,
        mediaUrls: (options?.mediaUrls ?? []) as Prisma.InputJsonValue,
        contentVariants: (options?.contentVariants ?? {}) as Prisma.InputJsonValue,
        metadata: (options?.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.logger.debug(
      `Seeded evergreen candidate id=${candidate.id} org=${tenantId} platform=${platform}`,
    );

    return candidate;
  }

  // ─── pickFallback ─────────────────────────────────────────────────────────

  /**
   * Atomically reserve one evergreen candidate for publishing and replenish the
   * pool with a fresh clone.
   *
   * Returns the RESERVED candidate (ready for the normal publish pipeline) or
   * null when the pool is empty.
   */
  async pickFallback(
    tenantId: string,
    platform: string,
  ): Promise<ApPostCandidate | null> {
    return this._prisma.$transaction(async (tx) => {
      // Step 1 — lock the oldest PENDING evergreen candidate.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "ap_post_candidate"
        WHERE "organizationId" = ${tenantId}
          AND platform = ${platform}
          AND source = 'evergreen'
          AND status = 'PENDING'::"ApPostCandidateStatus"
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (locked.length === 0) {
        return null;
      }

      // Step 2 — read the full row so we can clone it.
      const original = await tx.apPostCandidate.findUniqueOrThrow({
        where: { id: locked[0].id },
      });

      // Step 3 — mark the original RESERVED (flows through publish pipeline).
      const reserved = await tx.apPostCandidate.update({
        where: { id: original.id },
        data: { status: ApPostCandidateStatus.RESERVED },
      });

      // Step 4 — immediately re-seed a clone so pool count stays constant.
      await tx.apPostCandidate.create({
        data: {
          organizationId: original.organizationId,
          platform: original.platform,
          content: original.content,
          source: 'evergreen',
          expiresAt: null,
          priority: original.priority,
          mediaUrls: original.mediaUrls,
          contentVariants: original.contentVariants,
          metadata: original.metadata,
        },
      });

      this.logger.log(
        `Evergreen fallback picked id=${reserved.id} org=${tenantId} platform=${platform} (pool replenished)`,
      );

      return reserved;
    });
  }

  // ─── poolSize ─────────────────────────────────────────────────────────────

  /**
   * Count of PENDING evergreen candidates for (tenantId, platform).
   * Useful for monitoring and tests.
   */
  async poolSize(tenantId: string, platform: string): Promise<number> {
    return this._prisma.apPostCandidate.count({
      where: {
        organizationId: tenantId,
        platform,
        source: 'evergreen',
        status: ApPostCandidateStatus.PENDING,
      },
    });
  }
}
