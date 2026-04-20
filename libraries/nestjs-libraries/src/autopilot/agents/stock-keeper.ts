/**
 * Stock keeper agent — slice 2.8
 *
 * Monitors per-(tenant, platform) stack depth and signals when the
 * candidate queue has dropped below its minimum threshold.
 *
 * This is a skeleton: `run()` performs a pure math check with no LLM call.
 * Phase 3 (slice 3.2) will wire the copywriter agent to respond to 'refill'
 * signals by generating new post candidates.
 *
 * Two entry points are exported:
 *   assessStock(input)         — pure synchronous depth check; shared by the
 *                                depth-enforcer service (slice 2.10) so it can
 *                                call the logic directly without a full AgentContext.
 *   runStockKeeper(ctx, input) — async AgentDefinition-compatible wrapper.
 *   stockKeeperAgent           — AgentDefinition for registry and pipeline use.
 */

import type { AgentDefinition, AgentContext } from './types';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface StockKeeperInput {
  tenantId: string;
  platform: string;
  /** Number of PENDING, non-expired candidates currently in the stack. */
  currentDepth: number;
  /** Minimum acceptable number of PENDING candidates. */
  minDepth: number;
}

export type StockKeeperAction = 'ok' | 'refill';

export interface StockKeeperOutput {
  action: StockKeeperAction;
  tenantId: string;
  platform: string;
  currentDepth: number;
  minDepth: number;
  /** Number of posts needed to reach minDepth; 0 when action is 'ok'. */
  deficit: number;
}

// ---------------------------------------------------------------------------
// Core logic — pure synchronous function
// ---------------------------------------------------------------------------

/**
 * Synchronous depth assessment with no side effects.
 *
 * Exported separately so the depth-enforcer cron (slice 2.10) can call
 * this without constructing a full AgentContext (which would require a
 * user and tenant object that don't exist in background tasks).
 */
export function assessStock(input: StockKeeperInput): StockKeeperOutput {
  const deficit = Math.max(0, input.minDepth - input.currentDepth);
  return {
    action: deficit > 0 ? 'refill' : 'ok',
    tenantId: input.tenantId,
    platform: input.platform,
    currentDepth: input.currentDepth,
    minDepth: input.minDepth,
    deficit,
  };
}

// ---------------------------------------------------------------------------
// System prompt (used in Phase 3 when LLM reasoning is added)
// ---------------------------------------------------------------------------

const STOCK_KEEPER_SYSTEM_PROMPT = `\
You are the stock-keeper agent for an AI social-media autopilot.

Your responsibility: monitor the depth of each tenant's per-platform post
queue (the "stack") and determine when new content must be generated to
keep the queue healthy.

Given the current depth and the minimum-depth threshold for a
(tenant, platform) pair, you produce one of two signals:

  ok      — depth is at or above the minimum; no action needed.
  refill  — depth is below the minimum; the copywriter agent must
             generate \`deficit\` new post candidates.

Future versions of this agent will also receive analytics context to
suggest content topics, preferred posting cadences, and quantity guidance.
In the current skeleton, the decision is purely mathematical.`;

// ---------------------------------------------------------------------------
// AgentDefinition wrapper
// ---------------------------------------------------------------------------

export async function runStockKeeper(
  _ctx: AgentContext,
  input: StockKeeperInput,
): Promise<StockKeeperOutput> {
  return assessStock(input);
}

export const stockKeeperAgent: AgentDefinition<StockKeeperInput, StockKeeperOutput> = {
  id: 'stock_keeper',
  systemPrompt: STOCK_KEEPER_SYSTEM_PROMPT,
  allowedSkills: [],
  run: runStockKeeper,
};

export default stockKeeperAgent;
