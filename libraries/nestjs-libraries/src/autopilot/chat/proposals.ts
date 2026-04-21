/**
 * Proposal → confirm → apply pipeline — slice 1.4
 *
 * API (all functions accept a PrismaClient):
 *   createProposal  — persist a PENDING ApConfigChangeProposal row
 *   listPending     — return non-expired PENDING proposals for a tenant
 *   confirm         — validate + dispatch to entity applier + mark APPLIED
 *   cancel          — mark CANCELLED
 *
 * Entity appliers are registered via registerApplier().  Built-in appliers
 * for business_profile and growth_rule are registered at module load time.
 * Future slices (e.g. cadence_config) call registerApplier() from their own
 * module without modifying this file.
 *
 * "User edits always win" semantics:
 *   confirm() is an explicit user action, so every confirmed proposal is
 *   treated as user-sanctioned.  The updatedBy field on business_profile is
 *   set to AI (origin of the proposal) so the UI can indicate provenance.
 *   If the user directly edits a field between a proposal being created and
 *   being confirmed, the confirm will overwrite their direct edit — but that
 *   is the user's own choice at confirm time.
 */

import {
  PrismaClient,
  ApProposalStatus,
  ApUpdatedBy,
  ApGrowthRuleSource,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalDraft {
  targetEntity: string;
  targetId?: string | null;
  changes: Record<string, unknown>;
  rationale: string;
  /** Minutes until the proposal auto-expires (default: 60). */
  expiresInMinutes?: number;
}

export interface ProposalRow {
  id: string;
  organizationId: string;
  originMessageId: string | null;
  targetEntity: string;
  targetId: string | null;
  changes: Record<string, unknown>;
  rationale: string;
  expiresAt: Date;
  status: ApProposalStatus;
  createdAt: Date;
  decidedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Applier registry
// ---------------------------------------------------------------------------

type Applier = (
  db: PrismaClient,
  tenantId: string,
  targetId: string | null,
  changes: Record<string, unknown>,
) => Promise<void>;

const APPLIER_MAP = new Map<string, Applier>();

/**
 * Register a target-entity applier.  Safe to call multiple times with the same
 * entity name — later registrations overwrite earlier ones.
 */
export function registerApplier(entity: string, fn: Applier): void {
  APPLIER_MAP.set(entity, fn);
}

// ---------------------------------------------------------------------------
// Built-in applier: business_profile
// ---------------------------------------------------------------------------

/** Fields the AI is allowed to propose changes for. */
const PROFILE_FIELDS = new Set([
  'niche',
  'brandVoiceShort',
  'brandVoiceExtended',
  'goals',
  'antiPatterns',
  'regulatoryFlags',
]);

async function applyBusinessProfile(
  db: PrismaClient,
  tenantId: string,
  _targetId: string | null,
  changes: Record<string, unknown>,
): Promise<void> {
  // Whitelist fields to prevent arbitrary DB mutations.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (PROFILE_FIELDS.has(k)) safe[k] = v;
  }

  await db.apBusinessProfile.upsert({
    where: { organizationId: tenantId },
    create: {
      organizationId: tenantId,
      niche: String(safe.niche ?? ''),
      brandVoiceShort: String(safe.brandVoiceShort ?? ''),
      brandVoiceExtended: String(safe.brandVoiceExtended ?? ''),
      ...(safe.goals !== undefined && { goals: safe.goals as object }),
      ...(safe.antiPatterns !== undefined && { antiPatterns: safe.antiPatterns as object }),
      ...(safe.regulatoryFlags !== undefined && { regulatoryFlags: safe.regulatoryFlags as object }),
      updatedBy: ApUpdatedBy.AI,
    },
    update: {
      ...(safe.niche !== undefined && { niche: String(safe.niche) }),
      ...(safe.brandVoiceShort !== undefined && { brandVoiceShort: String(safe.brandVoiceShort) }),
      ...(safe.brandVoiceExtended !== undefined && { brandVoiceExtended: String(safe.brandVoiceExtended) }),
      ...(safe.goals !== undefined && { goals: safe.goals as object }),
      ...(safe.antiPatterns !== undefined && { antiPatterns: safe.antiPatterns as object }),
      ...(safe.regulatoryFlags !== undefined && { regulatoryFlags: safe.regulatoryFlags as object }),
      updatedBy: ApUpdatedBy.AI,
    },
  });
}

// ---------------------------------------------------------------------------
// Built-in applier: growth_rule
// ---------------------------------------------------------------------------

async function applyGrowthRule(
  db: PrismaClient,
  tenantId: string,
  targetId: string | null,
  changes: Record<string, unknown>,
): Promise<void> {
  if (targetId) {
    // Update an existing rule by its id.
    await db.apGrowthRule.update({
      where: { id: targetId },
      data: {
        ...(changes.ruleKey !== undefined && { ruleKey: String(changes.ruleKey) }),
        ...(changes.ruleValue !== undefined && { ruleValue: changes.ruleValue as object }),
        ...(changes.active !== undefined && { active: Boolean(changes.active) }),
        source: ApGrowthRuleSource.AI,
      },
    });
  } else {
    // Create a new rule.
    await db.apGrowthRule.create({
      data: {
        organizationId: tenantId,
        ruleKey: String(changes.ruleKey ?? 'unnamed'),
        ruleValue: (changes.ruleValue ?? {}) as object,
        source: ApGrowthRuleSource.AI,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Built-in applier: tenant_strategy_optout
// ---------------------------------------------------------------------------

/**
 * Toggle strategy-pattern contribution opt-out for the tenant.
 *
 * Presence of an ApTenantStrategyOptout row = opted out.
 * Absence = opted in (the default).
 *
 *   changes.optedOut === true  → upsert (create if absent; no-op if present)
 *   changes.optedOut === false → deleteMany (remove the row; no-op if absent)
 *
 * All other change keys are silently ignored.
 */
async function applyTenantStrategyOptout(
  db: PrismaClient,
  tenantId: string,
  _targetId: string | null,
  changes: Record<string, unknown>,
): Promise<void> {
  if (changes.optedOut === true) {
    await db.apTenantStrategyOptout.upsert({
      where: { organizationId: tenantId },
      create: {
        organizationId: tenantId,
        ...(typeof changes.reason === 'string' ? { reason: changes.reason } : {}),
      },
      update: {}, // Already opted out — no-op
    });
  } else if (changes.optedOut === false) {
    await db.apTenantStrategyOptout.deleteMany({
      where: { organizationId: tenantId },
    });
  }
}

// Register built-in appliers on module load.
registerApplier('business_profile', applyBusinessProfile);
registerApplier('growth_rule', applyGrowthRule);
registerApplier('tenant_strategy_optout', applyTenantStrategyOptout);

// ---------------------------------------------------------------------------
// createProposal
// ---------------------------------------------------------------------------

/**
 * Persist a pending proposal.  Returns the new proposal id.
 */
export async function createProposal(
  db: PrismaClient,
  tenantId: string,
  draft: ProposalDraft,
  originMessageId?: string | null,
): Promise<string> {
  const expiresAt = new Date(
    Date.now() + (draft.expiresInMinutes ?? 60) * 60 * 1000,
  );

  const row = await db.apConfigChangeProposal.create({
    data: {
      organizationId: tenantId,
      originMessageId: originMessageId ?? null,
      targetEntity: draft.targetEntity,
      targetId: draft.targetId ?? null,
      changes: draft.changes as object,
      rationale: draft.rationale,
      expiresAt,
      status: ApProposalStatus.PENDING,
    },
  });

  return row.id;
}

// ---------------------------------------------------------------------------
// listPending
// ---------------------------------------------------------------------------

/**
 * Return all PENDING, non-expired proposals for a tenant, newest first.
 */
export async function listPending(
  db: PrismaClient,
  tenantId: string,
): Promise<ProposalRow[]> {
  const rows = await db.apConfigChangeProposal.findMany({
    where: {
      organizationId: tenantId,
      status: ApProposalStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((r) => ({
    ...r,
    changes: r.changes as Record<string, unknown>,
  }));
}

// ---------------------------------------------------------------------------
// confirm
// ---------------------------------------------------------------------------

export type ConfirmFailureReason =
  | 'not_found'
  | 'expired'
  | 'wrong_status'
  | 'no_applier'
  | 'apply_error';

export type ConfirmResult =
  | { ok: true }
  | { ok: false; reason: ConfirmFailureReason; message: string };

/**
 * Confirm a pending proposal:
 *   1. Fetch the row.
 *   2. Guard: must be PENDING and not yet expired.
 *   3. Dispatch to the registered entity applier.
 *   4. Mark the proposal APPLIED.
 *
 * Returns a typed result — never throws.
 */
export async function confirm(
  db: PrismaClient,
  proposalId: string,
): Promise<ConfirmResult> {
  const row = await db.apConfigChangeProposal.findUnique({
    where: { id: proposalId },
  });

  if (!row) {
    return {
      ok: false,
      reason: 'not_found',
      message: `Proposal "${proposalId}" not found.`,
    };
  }

  if (row.status !== ApProposalStatus.PENDING) {
    return {
      ok: false,
      reason: 'wrong_status',
      message: `Proposal is ${row.status}, expected PENDING.`,
    };
  }

  if (new Date(row.expiresAt) <= new Date()) {
    // Persist the EXPIRED transition so future calls return wrong_status.
    await db.apConfigChangeProposal
      .update({
        where: { id: proposalId },
        data: { status: ApProposalStatus.EXPIRED, decidedAt: new Date() },
      })
      .catch(() => undefined); // best-effort

    return { ok: false, reason: 'expired', message: 'Proposal has expired.' };
  }

  const applier = APPLIER_MAP.get(row.targetEntity);
  if (!applier) {
    return {
      ok: false,
      reason: 'no_applier',
      message: `No applier registered for entity "${row.targetEntity}".`,
    };
  }

  try {
    await applier(
      db,
      row.organizationId,
      row.targetId,
      row.changes as Record<string, unknown>,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'apply_error', message: `Applier failed: ${msg}` };
  }

  await db.apConfigChangeProposal.update({
    where: { id: proposalId },
    data: { status: ApProposalStatus.APPLIED, decidedAt: new Date() },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

/**
 * Cancel a pending proposal.
 * Idempotent — updating an already-cancelled proposal has no effect.
 */
export async function cancel(
  db: PrismaClient,
  proposalId: string,
): Promise<void> {
  await db.apConfigChangeProposal.update({
    where: { id: proposalId },
    data: { status: ApProposalStatus.CANCELLED, decidedAt: new Date() },
  });
}
