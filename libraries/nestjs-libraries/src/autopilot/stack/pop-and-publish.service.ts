/**
 * PopAndPublishService — slice 2.6
 *
 * Sweeps PENDING `ApScheduledSlot` rows whose `scheduledAt ≤ now()`, pops the
 * top candidate from the stack for each `(org, platform)`, creates a Postiz
 * `Post` row, emits it to the `'post'` BullMQ queue, and records the event in
 * `ap_published_post`.
 *
 * Concurrency safety
 * ──────────────────
 * The slot is atomically transitioned from PENDING → TRIGGERED via
 * `updateMany({ where: { id, status: PENDING } })`.  Only the runner that
 * sees `count=1` proceeds; the other sees `count=0` and skips.  This
 * prevents duplicate publishing when multiple app instances run the cron
 * simultaneously.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ApPostCandidateStatus,
  ApScheduledSlotStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { BullMqClient } from '@gitroom/nestjs-libraries/bull-mq-transport-new/client';
import { popTop } from '@gitroom/autopilot/stack/index';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { EvergreenPoolService } from './evergreen-pool.service';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface TriggerResult {
  /** Number of slots that fired a post. */
  triggered: number;
  /** Number of slots skipped (no integration or empty stack). */
  skipped: number;
  /** Number of slots that could not be claimed (concurrent runner got them). */
  alreadyClaimed: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PopAndPublishService {
  private readonly logger = new Logger(PopAndPublishService.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _bullMq: BullMqClient,
    private readonly _evergreenPool: EvergreenPoolService,
  ) {}

  /**
   * Find all PENDING slots due now and attempt to trigger each one.
   * Safe to call concurrently — each slot is claimed atomically.
   */
  async triggerDueSlots(): Promise<TriggerResult> {
    const now = new Date();

    const dueSlots = await this._prisma.apScheduledSlot.findMany({
      where: {
        scheduledAt: { lte: now },
        status: ApScheduledSlotStatus.PENDING,
      },
    });

    const result: TriggerResult = { triggered: 0, skipped: 0, alreadyClaimed: 0 };

    for (const slot of dueSlots) {
      try {
        const outcome = await this._processSlot(slot.id, slot.organizationId, slot.platform, slot.scheduledAt);
        if (outcome === 'triggered') result.triggered++;
        else if (outcome === 'skipped') result.skipped++;
        else result.alreadyClaimed++;
      } catch (err) {
        this.logger.error(`Unhandled error processing slot ${slot.id}: ${err}`);
        // Best-effort: mark as skipped so the slot doesn't remain TRIGGERED
        // with no matching post.  If the slot was already claimed (TRIGGERED)
        // by this runner but we failed mid-way, revert.
        try {
          await this._prisma.apScheduledSlot.updateMany({
            where: { id: slot.id, status: ApScheduledSlotStatus.TRIGGERED },
            data: {
              status: ApScheduledSlotStatus.SKIPPED,
              metadata: { skipReason: `error: ${String(err)}` } as Prisma.InputJsonValue,
            },
          });
        } catch (_) {
          // ignore revert failure
        }
        result.skipped++;
      }
    }

    this.logger.log(
      `triggerDueSlots complete — triggered=${result.triggered} skipped=${result.skipped} alreadyClaimed=${result.alreadyClaimed}`,
    );

    return result;
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private async _processSlot(
    slotId: string,
    organizationId: string,
    platform: string,
    scheduledAt: Date,
  ): Promise<'triggered' | 'skipped' | 'already_claimed'> {
    // Step 1 — atomically claim the slot (PENDING → TRIGGERED).
    // If another runner already claimed it, updateMany returns count=0.
    const claimed = await this._prisma.apScheduledSlot.updateMany({
      where: { id: slotId, status: ApScheduledSlotStatus.PENDING },
      data: { status: ApScheduledSlotStatus.TRIGGERED },
    });

    if (claimed.count === 0) {
      return 'already_claimed';
    }

    // Step 2 — find a usable integration for this (org, platform).
    const integration = await this._prisma.integration.findFirst({
      where: {
        organizationId,
        providerIdentifier: platform,
        disabled: false,
        refreshNeeded: false,
        deletedAt: null,
      },
    });

    if (!integration) {
      await this._markSkipped(slotId, 'no_integration');
      return 'skipped';
    }

    // Step 3 — pop the top candidate from the stack (PENDING → RESERVED).
    // Fall back to the evergreen pool if the regular stack is empty.
    let candidate = await popTop(this._prisma, organizationId, platform);

    if (!candidate) {
      candidate = await this._evergreenPool.pickFallback(organizationId, platform);
    }

    if (!candidate) {
      await this._markSkipped(slotId, 'empty_stack_no_evergreen');
      return 'skipped';
    }

    // Step 4 — create a Postiz Post row and emit to the BullMQ 'post' queue.
    const group = makeId(10);
    const post = await this._prisma.post.create({
      data: {
        state: 'QUEUE',
        publishDate: scheduledAt,
        organizationId,
        integrationId: integration.id,
        content: candidate.content,
        group,
      },
    });

    this._bullMq.emit('post', {
      id: post.id,
      options: { delay: 0 },
      payload: { id: post.id },
    });

    // Step 5 — bind the candidate to the slot and mark it PUBLISHED.
    await this._prisma.apScheduledSlot.update({
      where: { id: slotId },
      data: { postCandidateId: candidate.id },
    });

    await this._prisma.apPostCandidate.update({
      where: { id: candidate.id },
      data: { status: ApPostCandidateStatus.PUBLISHED },
    });

    // Step 6 — record the publish event.
    await this._prisma.apPublishedPost.create({
      data: {
        organizationId,
        platform,
        postCandidateId: candidate.id,
        scheduledSlotId: slotId,
        postizPostId: post.id,
        publishedAt: scheduledAt,
      },
    });

    this.logger.log(
      `Triggered slot=${slotId} org=${organizationId} platform=${platform} postizPostId=${post.id}`,
    );

    return 'triggered';
  }

  /**
   * Revert a slot that was claimed (TRIGGERED) but had no integration or
   * empty stack, so the scheduler doesn't lose track of it.
   */
  private async _markSkipped(slotId: string, reason: string): Promise<void> {
    await this._prisma.apScheduledSlot.update({
      where: { id: slotId },
      data: {
        status: ApScheduledSlotStatus.SKIPPED,
        metadata: { skipReason: reason } as Prisma.InputJsonValue,
      },
    });
  }
}
