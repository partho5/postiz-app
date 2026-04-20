import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DepthEnforcerService } from '@gitroom/autopilot/stack/depth-enforcer.service';

/**
 * EnforceStackDepth — slice 2.10
 *
 * Runs every 15 minutes and asks DepthEnforcerService to check the post-
 * candidate stack depth across all active cadence configs.  Emits a warning
 * log for every (org, platform) pair that falls below its minimum threshold.
 *
 * Frequency rationale: 15-minute checks give a reasonable lead time before a
 * slot fires (slots are materialized hourly by MaterializeSlots), so the
 * operator has time to react or the copywriter agent (Phase 3) can refill
 * before the next trigger window.
 *
 * The inner call is read-only and safe to run concurrently.
 */
@Injectable()
export class EnforceStackDepth {
  private readonly logger = new Logger(EnforceStackDepth.name);

  constructor(private readonly _enforcer: DepthEnforcerService) {}

  @Cron('*/15 * * * *')
  async handleCron() {
    const result = await this._enforcer.enforceAll();
    if (result.deficits > 0) {
      this.logger.warn(
        `Depth enforcement: ${result.deficits}/${result.configs} pair(s) below minimum — needs refill`,
      );
    }
  }
}
