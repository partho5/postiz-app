import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PopAndPublishService } from '@gitroom/autopilot/stack/pop-and-publish.service';

/**
 * TriggerDueSlots — slice 2.6
 *
 * Runs every minute and asks PopAndPublishService to sweep PENDING
 * ApScheduledSlot rows whose scheduledAt ≤ now(), pop a candidate from
 * the stack for each, and emit to the Postiz 'post' BullMQ queue.
 *
 * The inner call is concurrency-safe — each slot is claimed atomically.
 */
@Injectable()
export class TriggerDueSlots {
  private readonly logger = new Logger(TriggerDueSlots.name);

  constructor(private readonly _popAndPublish: PopAndPublishService) {}

  @Cron('* * * * *')
  async handleCron() {
    const result = await this._popAndPublish.triggerDueSlots();
    if (result.triggered > 0 || result.skipped > 0) {
      this.logger.log(
        `Trigger run — triggered=${result.triggered} skipped=${result.skipped} alreadyClaimed=${result.alreadyClaimed}`,
      );
    }
  }
}
