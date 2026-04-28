/**
 * Orchestrator tool registry — slice 1.3.c (starter) + 1.3.d (management)
 *                              + 1.3.e (insight) + 1.3.f (profile/memory)
 *
 * Each tool is built via a factory so its dependencies can be injected
 * explicitly without bloating `OrchestratorContext`. `buildOrchestratorTools`
 * returns the array the orchestrator agent passes to `generateText({ tools })`.
 */

import type { DirectActionHandler } from '../../chat/direct_action_handler';
import type { CadenceConfigService } from '../../stack/cadence-config.service';
import type { OrchestratorTool } from '../types';

import { createSchedulePostTool } from './schedule_post';
import { createListScheduledPostsTool } from './list_scheduled_posts';
import { createCancelPendingDraftTool } from './cancel_pending_draft';
import { createClarifyWithUserTool } from './clarify_with_user';
import { createCancelScheduledPostTool } from './cancel_scheduled_post';
import { createReschedulePostTool } from './reschedule_post';
import { createPausePostingTool } from './pause_posting';
import { createResumePostingTool } from './resume_posting';
import { createRollbackPublishedPostTool } from './rollback_published_post';
import { createAnalyticsSnapshotTool } from './analytics_snapshot';
import { createResearchTopicTool } from './research_topic';
import { createScrapeCompetitorTool } from './scrape_competitor';
import { createGetProfileTool } from './get_profile';
import { createUpdateBusinessProfileTool } from './update_business_profile';
import { createSetStrategyOptoutTool } from './set_strategy_optout';
import { createSaveMemoryTool } from './save_memory';
import { createRecallMemoryTool } from './recall_memory';
import { createGetOlderHistoryTool } from './get_older_history';
import { createSearchKnowledgeTool } from './search_knowledge';
import { createSetTimezoneTool } from './set_timezone';
import { createReadTimeSlotsTool } from './read_time_slots';
import { createUpdateTimeSlotsTool } from './update_time_slots';
import { createUpdatePostsPerDayTool } from './update_posts_per_day';
import { createPauseAllTool } from './pause_all';
import { createSetBlackoutWindowTool } from './set_blackout_window';
import { createSetFrequencyCapTool } from './set_frequency_cap';

export interface OrchestratorToolDeps {
  directAction: DirectActionHandler;
  cadenceConfig: CadenceConfigService;
}

export function buildOrchestratorTools(
  deps: OrchestratorToolDeps,
): OrchestratorTool<unknown, unknown>[] {
  return [
    // ── Slice 1.3.c — starter tools ──────────────────────────────────────
    createSchedulePostTool({ directAction: deps.directAction }) as OrchestratorTool<unknown, unknown>,
    createListScheduledPostsTool() as OrchestratorTool<unknown, unknown>,
    createCancelPendingDraftTool({ directAction: deps.directAction }) as OrchestratorTool<unknown, unknown>,
    createClarifyWithUserTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice 1.3.d — management tools ───────────────────────────────────
    createCancelScheduledPostTool() as OrchestratorTool<unknown, unknown>,
    createReschedulePostTool() as OrchestratorTool<unknown, unknown>,
    createPausePostingTool({ cadenceConfig: deps.cadenceConfig }) as OrchestratorTool<unknown, unknown>,
    createResumePostingTool({ cadenceConfig: deps.cadenceConfig }) as OrchestratorTool<unknown, unknown>,
    createRollbackPublishedPostTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice 1.3.e — insight tools ──────────────────────────────────────
    createAnalyticsSnapshotTool() as OrchestratorTool<unknown, unknown>,
    createResearchTopicTool() as OrchestratorTool<unknown, unknown>,
    createScrapeCompetitorTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice 1.3.f — profile/memory tools ───────────────────────────────
    createGetProfileTool() as OrchestratorTool<unknown, unknown>,
    createUpdateBusinessProfileTool() as OrchestratorTool<unknown, unknown>,
    createSetStrategyOptoutTool() as OrchestratorTool<unknown, unknown>,
    createSaveMemoryTool() as OrchestratorTool<unknown, unknown>,
    createRecallMemoryTool() as OrchestratorTool<unknown, unknown>,
    createGetOlderHistoryTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice 1.3.g — knowledge base search ──────────────────────────────────
    createSearchKnowledgeTool() as OrchestratorTool<unknown, unknown>,
    // ── Timezone preference ───────────────────────────────────────────────────
    createSetTimezoneTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.1 — cadence config read ──────────────────────────────────────
    createReadTimeSlotsTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.2 — cadence CRUD ──────────────────────────────────────────────
    createUpdateTimeSlotsTool() as OrchestratorTool<unknown, unknown>,
    createUpdatePostsPerDayTool() as OrchestratorTool<unknown, unknown>,
    createPauseAllTool({ cadenceConfig: deps.cadenceConfig }) as OrchestratorTool<unknown, unknown>,
    createSetBlackoutWindowTool() as OrchestratorTool<unknown, unknown>,
    createSetFrequencyCapTool() as OrchestratorTool<unknown, unknown>,
  ];
}

export {
  createSchedulePostTool,
  createListScheduledPostsTool,
  createCancelPendingDraftTool,
  createClarifyWithUserTool,
  createCancelScheduledPostTool,
  createReschedulePostTool,
  createPausePostingTool,
  createResumePostingTool,
  createRollbackPublishedPostTool,
  createAnalyticsSnapshotTool,
  createResearchTopicTool,
  createScrapeCompetitorTool,
  createGetProfileTool,
  createUpdateBusinessProfileTool,
  createSetStrategyOptoutTool,
  createSaveMemoryTool,
  createRecallMemoryTool,
  createGetOlderHistoryTool,
  createSearchKnowledgeTool,
  createSetTimezoneTool,
  createReadTimeSlotsTool,
  createUpdateTimeSlotsTool,
  createUpdatePostsPerDayTool,
  createPauseAllTool,
  createSetBlackoutWindowTool,
  createSetFrequencyCapTool,
};
