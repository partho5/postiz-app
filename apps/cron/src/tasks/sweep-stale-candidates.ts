import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StaleSweeperService } from '@gitroom/autopilot/stack/stale-sweeper.service';

/**
 * SweepStaleCandidates — slice 2.9
 *
 * Runs every hour at :30 (offset from materialize-slots which runs at :00)
 * and asks StaleSweeperService to expire all PENDING ApPostCandidate rows
 * whose expiresAt has passed, globally across all tenants.
 *
 * The inner call is idempotent — rows already EXPIRED are never touched.
 */
@Injectable()
export class SweepStaleCandidates {
  private readonly logger = new Logger(SweepStaleCandidates.name);

  constructor(private readonly _sweeper: StaleSweeperService) {}

  @Cron('30 * * * *')
  async handleCron() {
    const count = await this._sweeper.sweepAll();
    if (count > 0) {
      this.logger.log(`Stale sweep done — expired=${count}`);
    }
  }
}
