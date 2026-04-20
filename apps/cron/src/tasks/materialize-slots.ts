import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SlotSchedulerService } from '@gitroom/autopilot/stack/slot-scheduler.service';

/**
 * MaterializeSlots — slice 2.5
 *
 * Runs every hour and asks SlotSchedulerService to fill in PENDING
 * ApScheduledSlot rows for all active cadence configs, looking 7 days ahead.
 *
 * The inner call is idempotent — re-running never creates duplicates.
 */
@Injectable()
export class MaterializeSlots {
  private readonly logger = new Logger(MaterializeSlots.name);

  constructor(private readonly _slotScheduler: SlotSchedulerService) {}

  @Cron('0 * * * *')
  async handleCron() {
    this.logger.log('Running slot materialization cron');
    const result = await this._slotScheduler.materializeSlots(7);
    this.logger.log(
      `Slot materialization done — configs=${result.configs} created=${result.created}`,
    );
  }
}
