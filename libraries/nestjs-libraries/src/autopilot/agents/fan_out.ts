/**
 * Fan-out agent — slice 3.2
 *
 * Turns a topic (from user intent or external trigger) into per-platform
 * drafts and pushes them to the corresponding post-candidate stacks.
 *
 * Flow:
 *   1. Determine target platforms — either from explicit input or by
 *      querying active, non-paused cadence configs for the tenant.
 *   2. For each platform, call the copywriter agent to generate drafts.
 *   3. Push each draft to the platform's stack via push().
 *   4. Return a per-platform summary of what was pushed.
 *
 * Dependencies (verified against actual source files):
 *   runCopywriter(ctx, input)                       — agents/copywriter.ts
 *   push(db, tenantId, platform, content, options?) — stack/index.ts
 *   AgentDefinition, AgentContext                   — agents/types.ts
 *   PrismaClient                                    — @prisma/client
 */

import { PrismaClient } from '@prisma/client';
import { runCopywriter, type CopywriterOutput } from './copywriter';
import { push } from '../stack';
import type { AgentDefinition, AgentContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FanOutInput {
  /** Topic or brief describing what the posts should be about. */
  topic: string;
  /** Explicit list of target platforms. When omitted, all active non-paused cadence configs are used. */
  platforms?: string[];
  /** Optional extra guidelines forwarded to the copywriter (e.g. "mention the launch date"). */
  guidelines?: string;
  /** Number of draft variants per platform. Defaults to 1. */
  countPerPlatform?: number;
  /** Priority for pushed candidates. Defaults to 10 (higher than stock-keeper fills). */
  priority?: number;
}

export interface FanOutPlatformResult {
  /** Platform name (e.g. 'twitter', 'linkedin'). */
  platform: string;
  /** Number of candidates pushed to the stack. */
  pushed: number;
  /** IDs of the created post candidates. */
  candidateIds: string[];
}

export interface FanOutOutput {
  /** Per-platform push results. */
  results: FanOutPlatformResult[];
  /** Platforms that were skipped (e.g. paused, no drafts generated). */
  skipped: Array<{ platform: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Fan out a topic across target platforms: generate drafts via the copywriter
 * and push them to each platform's post-candidate stack.
 */
export async function runFanOut(
  ctx: AgentContext,
  input: FanOutInput,
): Promise<FanOutOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;
  const count = Math.max(1, Math.min(input.countPerPlatform ?? 1, 5));
  const priority = input.priority ?? 10;

  // 1. Resolve target platforms.
  const platforms = await resolvePlatforms(db, tenantId, input.platforms);

  if (platforms.length === 0) {
    return { results: [], skipped: [{ platform: '*', reason: 'no_active_platforms' }] };
  }

  // 2. Fan out: generate + push per platform.
  const results: FanOutPlatformResult[] = [];
  const skipped: FanOutOutput['skipped'] = [];

  // Process platforms sequentially to avoid overwhelming the LLM with
  // concurrent requests (each calls generateObject internally).
  for (const platform of platforms) {
    let copywriterOutput: CopywriterOutput;
    try {
      copywriterOutput = await runCopywriter(ctx, {
        platform,
        topic: input.topic,
        count,
        guidelines: input.guidelines,
      });
    } catch (err) {
      skipped.push({
        platform,
        reason: `copywriter_error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (copywriterOutput.drafts.length === 0) {
      skipped.push({ platform, reason: 'no_drafts_generated' });
      continue;
    }

    // 3. Push each draft to the platform stack.
    const candidateIds: string[] = [];
    for (const draft of copywriterOutput.drafts) {
      const candidate = await push(db, tenantId, platform, draft.content, {
        priority,
        source: 'fan_out_agent',
        metadata: {
          topic: input.topic,
          hookType: draft.hookType ?? null,
          cta: draft.cta ?? null,
          hashtags: draft.hashtags ?? [],
        },
      });
      candidateIds.push(candidate.id);
    }

    results.push({ platform, pushed: candidateIds.length, candidateIds });
  }

  return { results, skipped };
}

// ---------------------------------------------------------------------------
// Platform resolution
// ---------------------------------------------------------------------------

/**
 * Resolve target platforms for the fan-out.
 *
 * When an explicit list is provided, return it as-is (the user's choice
 * overrides cadence config state).
 *
 * Otherwise, query all active, non-paused cadence configs for the tenant
 * and return their platform names — the same query pattern used by
 * DepthEnforcerService and SlotSchedulerService.
 */
async function resolvePlatforms(
  db: PrismaClient,
  tenantId: string,
  explicit?: string[],
): Promise<string[]> {
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const now = new Date();
  const configs = await db.apCadenceConfig.findMany({
    where: {
      organizationId: tenantId,
      active: true,
      OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
    },
    select: { platform: true },
  });

  return configs.map((c) => c.platform);
}

// ---------------------------------------------------------------------------
// System prompt (for AgentDefinition / testing)
// ---------------------------------------------------------------------------

const FAN_OUT_SYSTEM_PROMPT = `\
You are the fan-out orchestrator for an AI-powered social media autopilot.

Your role: given a topic and target platforms, coordinate draft generation
for each platform and push the results to the per-platform post-candidate
stacks.  You delegate actual copywriting to the Copywriter agent and stack
management to the push primitive.

You ensure that:
  - Each target platform receives platform-appropriate drafts.
  - Drafts are pushed with the correct priority and source metadata.
  - Failures on one platform do not block others.
  - When no platforms are specified, you use all active non-paused platforms.`;

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

export const fanOutAgent: AgentDefinition<FanOutInput, FanOutOutput> = {
  id: 'fan_out',
  systemPrompt: FAN_OUT_SYSTEM_PROMPT,
  allowedSkills: [],
  run: runFanOut,
};

export default fanOutAgent;
