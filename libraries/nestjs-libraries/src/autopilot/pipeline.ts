import { PrismaClient } from '@prisma/client';
import type { SkillId, SkillContext, SkillRegistry } from './skills/types';
import { TIERS } from './tiers';
import type { HardFeature } from './tiers';
import { getSkillCost } from './skill-costs';

// ---------------------------------------------------------------------------
// PipelineContext
// ---------------------------------------------------------------------------

/**
 * Extends SkillContext with the tenant's current tier.
 * `tierId` defaults to 'free' until subscriptions are wired (slice 0.20).
 */
export interface PipelineContext extends SkillContext {
  /** The tenant's active tier id. Defaults to 'free'. */
  tierId: string;
}

// ---------------------------------------------------------------------------
// PipelineResult
// ---------------------------------------------------------------------------

export type PipelineFailureReason =
  | 'plan_gate'            // skill locked behind a tier feature the tenant lacks
  | 'insufficient_credits' // balance < cost
  | 'skill_not_found'      // skillId absent from the registry
  | 'skill_error';         // handler threw

export type PipelineResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: PipelineFailureReason; message: string };

// ---------------------------------------------------------------------------
// Skill → hard feature gate map
// ---------------------------------------------------------------------------

/**
 * Maps a skillId to the HardFeature it requires.
 * Skills absent from this map are gated only by credits.
 * Populated as paid-only skills are added; empty for MVP.
 */
const SKILL_HARD_GATES: Partial<Record<SkillId, HardFeature>> = {
  // example: 'scrape_apify': 'apify_basic',
};

/**
 * Registers (or removes) a hard-feature gate for a skill.
 * Pass `null` to remove an existing gate.
 * Exported for testing and for slice-by-slice population as skills are added.
 */
export function registerSkillGate(skillId: SkillId, feature: HardFeature | null): void {
  if (feature === null) {
    delete SKILL_HARD_GATES[skillId];
  } else {
    SKILL_HARD_GATES[skillId] = feature;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers (inline until slice 0.14 / 0.15 provide dedicated helpers)
// ---------------------------------------------------------------------------

/**
 * Returns the sum of all credit ledger deltas for the tenant (i.e., current balance).
 * A fresh tenant with no rows has balance 0.
 */
async function queryBalance(db: PrismaClient, tenantId: string): Promise<number> {
  const agg = await db.apCreditLedger.aggregate({
    where: { organizationId: tenantId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

/**
 * Stub: log activity. Replaced by the real helper in slice 0.14.
 * Returns void — callers must not depend on the return value.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function stubLogActivity(_ctx: PipelineContext, _skillId: SkillId, _ok: boolean): Promise<void> {
  // no-op until slice 0.14
}

/**
 * Stub: debit credits. Replaced by the real helper in slice 0.14.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function stubDebitCredits(_db: PrismaClient, _tenantId: string, _amount: number): Promise<void> {
  // no-op until slice 0.14
}

/**
 * Stub: log capability gap. Replaced by the real helper in slice 0.15.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function stubLogGap(_ctx: PipelineContext, _skillId: SkillId, _reason: string): Promise<void> {
  // no-op until slice 0.15
}

// ---------------------------------------------------------------------------
// runSkill — the single entry point every skill call routes through
// ---------------------------------------------------------------------------

/**
 * Pre-flight pipeline:
 *   1. Plan gate  — tier has the required hard feature (if any)
 *   2. Credit gate — balance ≥ cost
 *   3. Dispatch   — run the skill handler
 *   4. Log activity (stub until 0.14)
 *   5. Debit credits (stub until 0.14)
 *
 * Returns a discriminated union so callers never have to try/catch.
 */
export async function runSkill<Input = unknown, Output = unknown>(
  skillId: SkillId,
  ctx: PipelineContext,
  input: Input,
  registry: SkillRegistry
): Promise<PipelineResult<Output>> {
  const tier = TIERS[ctx.tierId] ?? TIERS['free'];

  // ------------------------------------------------------------------
  // 1. Plan gate
  // ------------------------------------------------------------------
  const requiredFeature = SKILL_HARD_GATES[skillId];
  if (requiredFeature && !tier.hard_features.includes(requiredFeature)) {
    await stubLogGap(ctx, skillId, `plan_gate:${requiredFeature}`);
    return {
      ok: false,
      reason: 'plan_gate',
      message: `Skill "${skillId}" requires feature "${requiredFeature}" not included in tier "${tier.id}".`,
    };
  }

  // ------------------------------------------------------------------
  // 2. Credit gate
  // ------------------------------------------------------------------
  const cost = getSkillCost(skillId);
  const balance = await queryBalance(ctx.db, ctx.tenant.id);
  if (balance < cost) {
    await stubLogGap(ctx, skillId, `insufficient_credits:balance=${balance},cost=${cost}`);
    return {
      ok: false,
      reason: 'insufficient_credits',
      message: `Insufficient credits: balance=${balance}, required=${cost}.`,
    };
  }

  // ------------------------------------------------------------------
  // 3. Registry lookup
  // ------------------------------------------------------------------
  const entry = registry[skillId];
  if (!entry) {
    return {
      ok: false,
      reason: 'skill_not_found',
      message: `Skill "${skillId}" is not registered.`,
    };
  }

  // ------------------------------------------------------------------
  // 4. Dispatch
  // ------------------------------------------------------------------
  let value: Output;
  try {
    value = (await entry.handler(ctx, input)) as Output;
  } catch (err) {
    await stubLogActivity(ctx, skillId, false);
    return {
      ok: false,
      reason: 'skill_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // ------------------------------------------------------------------
  // 5. Post-run: log + debit (stubs until 0.14)
  // ------------------------------------------------------------------
  await stubLogActivity(ctx, skillId, true);
  if (cost > 0) {
    await stubDebitCredits(ctx.db, ctx.tenant.id, cost);
  }

  return { ok: true, value };
}
