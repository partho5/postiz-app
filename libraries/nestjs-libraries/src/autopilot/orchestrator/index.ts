/**
 * Orchestrator barrel — slice 1.3.b
 *
 * Re-exports the type contract from `./types` so downstream code can do
 * `import { OrchestratorTool, OrchestratorContext } from '../orchestrator'`
 * without reaching into the file layout.
 *
 * Runtime exports (the dispatch loop, starter tools, state-snapshot
 * builder) land in slice 1.3.c+ and will be re-exported from here too.
 */

export type {
  OrchestratorContext,
  OrchestratorLogger,
  OrchestratorTool,
  OrchestratorToolResult,
  ChatScheduledListEvent,
  ChatAnalyticsCardEvent,
  ChatConfirmEvent,
  ChatActionResultEvent,
} from './types';

export { ORCHESTRATOR_TOOLS } from './types';
