import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// GapEntry
// ---------------------------------------------------------------------------

export interface GapEntry {
  tenantId: string;
  /** The original user message that triggered the skill attempt. */
  userMessage: string;
  /** Skill IDs that were attempted before the gap was detected. */
  attemptedSkills: string[];
  /** Human-readable reason the gap occurred (e.g. "plan_gate:article_ingestion"). */
  reason: string;
}

// ---------------------------------------------------------------------------
// logGap
// ---------------------------------------------------------------------------

/**
 * Persists a capability gap record to `ap_capability_gap`.
 *
 * A gap is logged whenever a skill call fails for reasons that indicate the
 * system cannot fulfil the user's intent — specifically plan gate failures
 * and insufficient-credits failures. Gaps are used for upgrade prompts and
 * product analytics.
 */
export async function logGap(db: PrismaClient, entry: GapEntry): Promise<void> {
  await db.apCapabilityGap.create({
    data: {
      organizationId: entry.tenantId,
      userMessage: entry.userMessage,
      attemptedSkills: entry.attemptedSkills,
      reason: entry.reason,
    },
  });
}
