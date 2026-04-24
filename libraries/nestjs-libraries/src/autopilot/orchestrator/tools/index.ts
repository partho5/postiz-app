/**
 * Orchestrator tool registry — slice 1.3.c
 *
 * Each starter tool is built via a factory so its dependencies (e.g.
 * `DirectActionHandler`) can be injected explicitly without bloating
 * `OrchestratorContext`. `buildOrchestratorTools` returns the array the
 * orchestrator agent passes to `generateText({ tools: ... })`.
 *
 * Slices 1.3.d–f will add more tools here. For each new tool:
 *   1. Create `orchestrator/tools/<name>.ts` exporting `create<Name>Tool`.
 *   2. Add it to the `OrchestratorToolDeps` type below if it needs any
 *      service injection.
 *   3. Register it in `buildOrchestratorTools`.
 */

import type { DirectActionHandler } from '../../chat/direct_action_handler';
import type { OrchestratorTool } from '../types';

import { createSchedulePostTool } from './schedule_post';
import { createListScheduledPostsTool } from './list_scheduled_posts';
import { createCancelPendingDraftTool } from './cancel_pending_draft';
import { createClarifyWithUserTool } from './clarify_with_user';

export interface OrchestratorToolDeps {
  directAction: DirectActionHandler;
}

export function buildOrchestratorTools(
  deps: OrchestratorToolDeps,
): OrchestratorTool<unknown, unknown>[] {
  return [
    createSchedulePostTool({ directAction: deps.directAction }) as OrchestratorTool<
      unknown,
      unknown
    >,
    createListScheduledPostsTool() as OrchestratorTool<unknown, unknown>,
    createCancelPendingDraftTool({
      directAction: deps.directAction,
    }) as OrchestratorTool<unknown, unknown>,
    createClarifyWithUserTool() as OrchestratorTool<unknown, unknown>,
  ];
}

export {
  createSchedulePostTool,
  createListScheduledPostsTool,
  createCancelPendingDraftTool,
  createClarifyWithUserTool,
};
