import { PrismaClient, ApActivityLogStatus, Prisma } from '@prisma/client';

export { ApActivityLogStatus };

// ---------------------------------------------------------------------------
// ActivityEntry
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  tenantId: string;
  userId?: string;
  skillId: string;
  status: ApActivityLogStatus;
  /** Credits charged for this call (0 for free skills). */
  creditsCharged: number;
  llmModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Dollar cost as a number or decimal string (e.g. "0.002300"). Omit if unknown. */
  dollarCost?: number | string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// logActivity
// ---------------------------------------------------------------------------

/**
 * Persists one activity log entry to `ap_activity_log`.
 * Fire-and-forget safe: callers should await but errors are non-fatal by design
 * (a failed log must never abort the skill result).
 */
export async function logActivity(db: PrismaClient, entry: ActivityEntry): Promise<void> {
  await db.apActivityLog.create({
    data: {
      organizationId: entry.tenantId,
      userId: entry.userId ?? null,
      skillId: entry.skillId,
      status: entry.status,
      creditsCharged: entry.creditsCharged,
      llmModel: entry.llmModel ?? null,
      inputTokens: entry.inputTokens ?? null,
      outputTokens: entry.outputTokens ?? null,
      dollarCost:
        entry.dollarCost !== undefined ? new Prisma.Decimal(entry.dollarCost) : null,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
