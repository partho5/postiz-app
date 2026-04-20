/**
 * StaleSweeperService — slice 2.9
 *
 * Thin NestJS injectable that wraps the `expire()` stack primitive for
 * global (all-tenant) stale-candidate cleanup.
 *
 * Keeping this as a separate injectable (rather than calling expire() directly
 * from the cron task) makes the service mockable in tests and consistent with
 * the pattern used by SlotSchedulerService and PopAndPublishService.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { expire } from './index';

@Injectable()
export class StaleSweeperService {
  private readonly logger = new Logger(StaleSweeperService.name);

  constructor(private readonly _prisma: PrismaService) {}

  /**
   * Mark all PENDING `ApPostCandidate` rows whose `expiresAt` is in the past
   * as EXPIRED, across every tenant.
   *
   * Returns the number of rows transitioned.  Logs only when count > 0 to
   * keep cron logs quiet during idle periods.
   */
  async sweepAll(): Promise<number> {
    const count = await expire(this._prisma);
    if (count > 0) {
      this.logger.log(`Swept ${count} stale post candidate(s) to EXPIRED`);
    }
    return count;
  }
}
