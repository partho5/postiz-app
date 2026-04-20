import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { BullMqModule } from '@gitroom/nestjs-libraries/bull-mq-transport-new/bull.mq.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { FILTER } from '@gitroom/nestjs-libraries/sentry/sentry.exception';
import { CheckMissingQueues } from '@gitroom/cron/tasks/check.missing.queues';
import { PostNowPendingQueues } from '@gitroom/cron/tasks/post.now.pending.queues';
import { SlotSchedulerService } from '@gitroom/autopilot/stack/slot-scheduler.service';
import { MaterializeSlots } from '@gitroom/cron/tasks/materialize-slots';
import { PopAndPublishService } from '@gitroom/autopilot/stack/pop-and-publish.service';
import { TriggerDueSlots } from '@gitroom/cron/tasks/trigger-due-slots';
import { StaleSweeperService } from '@gitroom/autopilot/stack/stale-sweeper.service';
import { SweepStaleCandidates } from '@gitroom/cron/tasks/sweep-stale-candidates';
import { DepthEnforcerService } from '@gitroom/autopilot/stack/depth-enforcer.service';
import { EnforceStackDepth } from '@gitroom/cron/tasks/enforce-stack-depth';
import { EvergreenPoolService } from '@gitroom/autopilot/stack/evergreen-pool.service';

@Module({
  imports: [
    SentryModule.forRoot(),
    DatabaseModule,
    ScheduleModule.forRoot(),
    BullMqModule,
  ],
  controllers: [],
  providers: [
    FILTER,
    CheckMissingQueues,
    PostNowPendingQueues,
    // autopilot — stack + scheduler (slices 2.5–2.6)
    SlotSchedulerService,
    MaterializeSlots,
    PopAndPublishService,
    TriggerDueSlots,
    // autopilot — stale sweeper (slice 2.9)
    StaleSweeperService,
    SweepStaleCandidates,
    // autopilot — depth enforcement (slice 2.10)
    DepthEnforcerService,
    EnforceStackDepth,
    // autopilot — evergreen fallback pool (slice 2.11)
    EvergreenPoolService,
  ],
})
export class CronModule {}
