import type { SkillId, SkillContext, SkillRegistry } from './skills/types';
import { TIERS } from './tiers';
import type { HardFeature } from './tiers';
import { getSkillCost } from './skill-costs';
import { getBalance, debitCredits, ApCreditLedgerReason } from './credits';
import { logActivity, ApActivityLogStatus } from './activity';
import { logGap } from './capability_gaps';

// ---------------------------------------------------------------------------
// PipelineContext
// ---------------------------------------------------------------------------

/**
 * Extends SkillContext with pipeline-specific fields.
 *
 * - `tierId`      — the tenant's active tier (defaults to 'free' until subscriptions
 *                   are wired in slice 0.20).
 * - `userMessage` — the original user message that triggered this skill call.
 *                   Used when logging capability gaps. Pass '' if unavailable.
 */
export interface PipelineContext extends SkillContext {
  tierId: string;
  userMessage?: string;
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

const SKILL_HARD_GATES: Partial<Record<SkillId, HardFeature>> = {};

/**
 * Registers (or removes) a hard-feature gate for a skill.
 * Pass `null` to remove an existing gate.
 */
export function registerSkillGate(skillId: SkillId, feature: HardFeature | null): void {
  if (feature === null) {
    delete SKILL_HARD_GATES[skillId];
  } else {
    SKILL_HARD_GATES[skillId] = feature;
  }
}

// ---------------------------------------------------------------------------
// runSkill — the single entry point every skill call routes through
// ---------------------------------------------------------------------------

/**
 * Pre-flight pipeline:
 *   1. Plan gate        — tier includes the required hard feature (if any)
 *   2. Credit gate      — balance ≥ cost
 *   3. Registry lookup  — skill exists
 *   4. Dispatch         — run the skill handler
 *   5. Log activity     — write to ap_activity_log
 *   6. Debit credits    — atomic ledger write (skipped for free skills)
 *
 * Gate failures log a capability gap and return a typed failure result.
 * Returns a discriminated union so callers never have to try/catch.
 */
export async function runSkill<Input = unknown, Output = unknown>(
  skillId: SkillId,
  ctx: PipelineContext,
  input: Input,
  registry: SkillRegistry
): Promise<PipelineResult<Output>> {
  const tier = TIERS[ctx.tierId] ?? TIERS['free'];
  const tenantId = ctx.tenant.id;
  const userMessage = ctx.userMessage ?? '';

  // ------------------------------------------------------------------
  // 1. Plan gate
  // ------------------------------------------------------------------
  const requiredFeature = SKILL_HARD_GATES[skillId];
  if (requiredFeature && !tier.hard_features.includes(requiredFeature)) {
    await logGap(ctx.db, {
      tenantId,
      userMessage,
      attemptedSkills: [skillId],
      reason: `plan_gate:${requiredFeature}`,
    }).catch(() => undefined); // gap logging is best-effort

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
  const balance = await getBalance(ctx.db, tenantId);
  if (balance < cost) {
    await logGap(ctx.db, {
      tenantId,
      userMessage,
      attemptedSkills: [skillId],
      reason: `insufficient_credits:balance=${balance},cost=${cost}`,
    }).catch(() => undefined);

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
    const message = err instanceof Error ? err.message : String(err);
    await logActivity(ctx.db, {
      tenantId,
      userId: ctx.user.id,
      skillId,
      status: ApActivityLogStatus.FAILURE,
      creditsCharged: 0,
      metadata: { error: message },
    }).catch(() => undefined);

    return { ok: false, reason: 'skill_error', message };
  }

  // ------------------------------------------------------------------
  // 5. Log activity
  // ------------------------------------------------------------------
  await logActivity(ctx.db, {
    tenantId,
    userId: ctx.user.id,
    skillId,
    status: ApActivityLogStatus.SUCCESS,
    creditsCharged: cost,
  }).catch(() => undefined);

  // ------------------------------------------------------------------
  // 6. Debit credits (skip for free skills to avoid empty ledger rows)
  // ------------------------------------------------------------------
  if (cost > 0) {
    await debitCredits(ctx.db, tenantId, cost, ApCreditLedgerReason.DEBIT).catch(
      () => undefined
    );
  }

  return { ok: true, value };
}
