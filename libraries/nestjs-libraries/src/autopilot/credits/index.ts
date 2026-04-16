import { PrismaClient, ApCreditLedgerReason } from '@prisma/client';

export { ApCreditLedgerReason };

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

/**
 * Returns the current credit balance for a tenant (sum of all ledger deltas).
 * Returns 0 for a tenant with no ledger rows.
 */
export async function getBalance(db: PrismaClient, tenantId: string): Promise<number> {
  const agg = await db.apCreditLedger.aggregate({
    where: { organizationId: tenantId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

// ---------------------------------------------------------------------------
// debitCredits
// ---------------------------------------------------------------------------

export type DebitResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: 'insufficient'; balance: number; requested: number };

/**
 * Atomically debits `amount` credits from the tenant's ledger.
 *
 * Uses a transaction to read the current balance and write the debit row
 * in a single operation, preventing double-spend under concurrent calls.
 *
 * Returns `{ ok: false, reason: 'insufficient' }` when `balance < amount`
 * without writing any row.
 *
 * `amount` must be a non-negative integer. Passing 0 is a no-op that always
 * succeeds (useful for free skills where we still want to record the call).
 */
export async function debitCredits(
  db: PrismaClient,
  tenantId: string,
  amount: number,
  reason: ApCreditLedgerReason = ApCreditLedgerReason.DEBIT,
  reference?: string
): Promise<DebitResult> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`debitCredits: amount must be a non-negative integer, got ${amount}`);
  }

  return db.$transaction(async (tx) => {
    const agg = await tx.apCreditLedger.aggregate({
      where: { organizationId: tenantId },
      _sum: { delta: true },
    });
    const balance = agg._sum.delta ?? 0;

    if (balance < amount) {
      return { ok: false as const, reason: 'insufficient' as const, balance, requested: amount };
    }

    const balanceAfter = balance - amount;

    await tx.apCreditLedger.create({
      data: {
        organizationId: tenantId,
        delta: -amount,
        balanceAfter,
        reason,
        reference: reference ?? null,
      },
    });

    return { ok: true as const, balanceAfter };
  });
}

// ---------------------------------------------------------------------------
// grantCredits  (convenience — used by billing and onboarding slices later)
// ---------------------------------------------------------------------------

/**
 * Adds `amount` credits to the tenant's ledger (positive delta).
 * Reason defaults to GRANT; use PURCHASE for paid top-ups.
 */
export async function grantCredits(
  db: PrismaClient,
  tenantId: string,
  amount: number,
  reason: ApCreditLedgerReason = ApCreditLedgerReason.GRANT,
  reference?: string
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`grantCredits: amount must be a positive integer, got ${amount}`);
  }

  return db.$transaction(async (tx) => {
    const agg = await tx.apCreditLedger.aggregate({
      where: { organizationId: tenantId },
      _sum: { delta: true },
    });
    const balance = agg._sum.delta ?? 0;
    const balanceAfter = balance + amount;

    await tx.apCreditLedger.create({
      data: {
        organizationId: tenantId,
        delta: amount,
        balanceAfter,
        reason,
        reference: reference ?? null,
      },
    });

    return balanceAfter;
  });
}
