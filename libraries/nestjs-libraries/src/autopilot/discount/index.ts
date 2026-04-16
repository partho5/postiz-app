import { PrismaClient, ApDiscountAmountType } from '@prisma/client';

export { ApDiscountAmountType };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscountResult {
  id: string;
  code: string | null;
  amountType: ApDiscountAmountType;
  amount: number;
  applicableTo: unknown;
}

// ---------------------------------------------------------------------------
// resolveDiscount
// ---------------------------------------------------------------------------

/**
 * Looks up an active, non-expired, non-exhausted discount by code.
 * Returns null if the code is unknown, inactive, expired, or has hit its max uses.
 */
export async function resolveDiscount(
  db: PrismaClient,
  code: string,
): Promise<DiscountResult | null> {
  const now = new Date();

  const discount = await db.apDiscount.findFirst({
    where: {
      code,
      active: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  });

  if (!discount) return null;

  if (discount.maxUses !== null && discount.usesCount >= discount.maxUses) {
    return null;
  }

  return {
    id: discount.id,
    code: discount.code,
    amountType: discount.amountType,
    amount: discount.amount,
    applicableTo: discount.applicableTo,
  };
}

// ---------------------------------------------------------------------------
// applyDiscount
// ---------------------------------------------------------------------------

/**
 * Records a discount application for a tenant and atomically increments the
 * discount's `usesCount`.
 *
 * Returns the new `ApDiscountApplication` id.
 */
export async function applyDiscount(
  db: PrismaClient,
  tenantId: string,
  discountId: string,
  invoiceId: string | null,
  amountApplied: number,
): Promise<string> {
  return db.$transaction(async (tx) => {
    await tx.apDiscount.update({
      where: { id: discountId },
      data: { usesCount: { increment: 1 } },
    });

    const application = await tx.apDiscountApplication.create({
      data: {
        discountId,
        organizationId: tenantId,
        invoiceId: invoiceId ?? null,
        amountApplied,
      },
    });

    return application.id;
  });
}

// ---------------------------------------------------------------------------
// listActive
// ---------------------------------------------------------------------------

/**
 * Lists all active, non-expired, non-exhausted discounts.
 * `tenantId` is accepted for future scoping (e.g., tenant-specific offers)
 * but is currently unused — all qualifying discounts are returned.
 */
export async function listActive(
  db: PrismaClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tenantId?: string,
): Promise<DiscountResult[]> {
  const now = new Date();

  const discounts = await db.apDiscount.findMany({
    where: {
      active: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  });

  return discounts
    .filter((d) => d.maxUses === null || d.usesCount < d.maxUses)
    .map((d) => ({
      id: d.id,
      code: d.code,
      amountType: d.amountType,
      amount: d.amount,
      applicableTo: d.applicableTo,
    }));
}
