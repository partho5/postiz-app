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
import { createListDraftsTool } from './list_drafts';
import { createReadDraftTool } from './read_draft';
import { createEditDraftTool } from './edit_draft';
import { createDeleteDraftTool } from './delete_draft';
import { createApproveDraftTool } from './approve_draft';
import { createRejectDraftTool } from './reject_draft';
import { createReadCalendarViewTool } from './read_calendar_view';
import { createComputeBestTimesTool } from './compute_best_times';
import { createListPublishErrorsTool } from './list_publish_errors';
import { createRetryPublishTool } from './retry_publish';
import { createQuarantinePostTool } from './quarantine_post';
import { createDraftThreadTool } from './draft_thread';
import { createDraftCarouselTool } from './draft_carousel';
import { createDraftLongformTool } from './draft_longform';
import { createDraftPollTool } from './draft_poll';
import { createApplyBrandVoiceTool } from './apply_brand_voice';
import { createSuggestHashtagsTool } from './suggest_hashtags';
import { createTranslatePostTool } from './translate_post';
import { createSuggestTopicsTool } from './suggest_topics';
import { createFetchTrendingTool } from './fetch_trending';
import { createGenerateContentCalendarTool } from './generate_content_calendar';
import { createRepurposeContentTool } from './repurpose_content';
import { createListWritingPromptsTool } from './list_writing_prompts';
import { createAddWritingPromptTool } from './add_writing_prompt';
import { createEditWritingPromptTool } from './edit_writing_prompt';
import { createDeleteWritingPromptTool } from './delete_writing_prompt';
import { createToggleWritingPromptTool } from './toggle_writing_prompt';

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
    // ── Slice E.3 — drafts/stack CRUD ────────────────────────────────────────
    createListDraftsTool() as OrchestratorTool<unknown, unknown>,
    createReadDraftTool() as OrchestratorTool<unknown, unknown>,
    createEditDraftTool() as OrchestratorTool<unknown, unknown>,
    createDeleteDraftTool() as OrchestratorTool<unknown, unknown>,
    createApproveDraftTool() as OrchestratorTool<unknown, unknown>,
    createRejectDraftTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.4 — calendar & best-time ─────────────────────────────────────
    createReadCalendarViewTool() as OrchestratorTool<unknown, unknown>,
    createComputeBestTimesTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.6 — publishing reliability ───────────────────────────────────
    createListPublishErrorsTool() as OrchestratorTool<unknown, unknown>,
    createRetryPublishTool() as OrchestratorTool<unknown, unknown>,
    createQuarantinePostTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.5 — content creation expansion ────────────────────────────────
    createDraftThreadTool() as OrchestratorTool<unknown, unknown>,
    createDraftCarouselTool() as OrchestratorTool<unknown, unknown>,
    createDraftLongformTool() as OrchestratorTool<unknown, unknown>,
    createDraftPollTool() as OrchestratorTool<unknown, unknown>,
    createApplyBrandVoiceTool() as OrchestratorTool<unknown, unknown>,
    createSuggestHashtagsTool() as OrchestratorTool<unknown, unknown>,
    createTranslatePostTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.7 — ideation tools ────────────────────────────────────────────
    createSuggestTopicsTool() as OrchestratorTool<unknown, unknown>,
    createFetchTrendingTool() as OrchestratorTool<unknown, unknown>,
    createGenerateContentCalendarTool() as OrchestratorTool<unknown, unknown>,
    createRepurposeContentTool() as OrchestratorTool<unknown, unknown>,
    // ── Slice E.8 — writing prompts ───────────────────────────────────────────
    createListWritingPromptsTool() as OrchestratorTool<unknown, unknown>,
    createAddWritingPromptTool() as OrchestratorTool<unknown, unknown>,
    createEditWritingPromptTool() as OrchestratorTool<unknown, unknown>,
    createDeleteWritingPromptTool() as OrchestratorTool<unknown, unknown>,
    createToggleWritingPromptTool() as OrchestratorTool<unknown, unknown>,
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
  createListDraftsTool,
  createReadDraftTool,
  createEditDraftTool,
  createDeleteDraftTool,
  createApproveDraftTool,
  createRejectDraftTool,
  createReadCalendarViewTool,
  createComputeBestTimesTool,
  createListPublishErrorsTool,
  createRetryPublishTool,
  createQuarantinePostTool,
  createDraftThreadTool,
  createDraftCarouselTool,
  createDraftLongformTool,
  createDraftPollTool,
  createApplyBrandVoiceTool,
  createSuggestHashtagsTool,
  createTranslatePostTool,
  createSuggestTopicsTool,
  createFetchTrendingTool,
  createGenerateContentCalendarTool,
  createRepurposeContentTool,
  createListWritingPromptsTool,
  createAddWritingPromptTool,
  createEditWritingPromptTool,
  createDeleteWritingPromptTool,
  createToggleWritingPromptTool,
};
