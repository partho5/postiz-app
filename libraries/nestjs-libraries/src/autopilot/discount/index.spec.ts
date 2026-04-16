import { resolveDiscount, applyDiscount, listActive } from './index';
import { ApDiscountAmountType } from '@prisma/client';

// ---------------------------------------------------------------------------
// In-memory mock DB
// ---------------------------------------------------------------------------

type DiscountRow = {
  id: string;
  code: string | null;
  amountType: ApDiscountAmountType;
  amount: number;
  applicableTo: unknown;
  validFrom: Date;
  validTo: Date;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  originNote: string;
  createdAt: Date;
};

type ApplicationRow = {
  id: string;
  discountId: string;
  organizationId: string;
  invoiceId: string | null;
  amountApplied: number;
  appliedAt: Date;
};

function makeMockDb(initial: DiscountRow[] = []) {
  const discounts = new Map<string, DiscountRow>(initial.map((d) => [d.id, { ...d }]));
  const applications: ApplicationRow[] = [];
  let nextAppId = 1;

  return {
    apDiscount: {
      async findFirst({ where }: any): Promise<DiscountRow | null> {
        const now = new Date();
        for (const d of discounts.values()) {
          if (where.code !== undefined && d.code !== where.code) continue;
          if (where.active !== undefined && d.active !== where.active) continue;
          if (where.validFrom?.lte && d.validFrom > where.validFrom.lte) continue;
          if (where.validTo?.gte && d.validTo < where.validTo.gte) continue;
          return { ...d };
        }
        return null;
      },
      async findMany({ where }: any): Promise<DiscountRow[]> {
        const results: DiscountRow[] = [];
        for (const d of discounts.values()) {
          if (where.active !== undefined && d.active !== where.active) continue;
          if (where.validFrom?.lte && d.validFrom > where.validFrom.lte) continue;
          if (where.validTo?.gte && d.validTo < where.validTo.gte) continue;
          results.push({ ...d });
        }
        return results;
      },
      async update({ where, data }: any): Promise<DiscountRow> {
        const d = discounts.get(where.id);
        if (!d) throw new Error(`Discount ${where.id} not found`);
        if (data.usesCount?.increment !== undefined) {
          d.usesCount += data.usesCount.increment;
        }
        return { ...d };
      },
    },
    apDiscountApplication: {
      async create({ data }: any): Promise<ApplicationRow> {
        const row: ApplicationRow = {
          id: `app-${nextAppId++}`,
          discountId: data.discountId,
          organizationId: data.organizationId,
          invoiceId: data.invoiceId ?? null,
          amountApplied: data.amountApplied,
          appliedAt: new Date(),
        };
        applications.push(row);
        return row;
      },
    },
    async $transaction(fn: (tx: any) => Promise<any>) {
      return fn(this);
    },
    _discounts: discounts,
    _applications: applications,
  } as any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date();
const PAST = new Date(NOW.getTime() - 86_400_000);
const FUTURE = new Date(NOW.getTime() + 86_400_000);
const FAR_FUTURE = new Date(NOW.getTime() + 2 * 86_400_000);

function makeDiscount(overrides: Partial<DiscountRow> = {}): DiscountRow {
  return {
    id: 'disc-1',
    code: 'SAVE10',
    amountType: ApDiscountAmountType.PERCENT,
    amount: 10,
    applicableTo: {},
    validFrom: PAST,
    validTo: FUTURE,
    maxUses: null,
    usesCount: 0,
    active: true,
    originNote: 'test discount',
    createdAt: PAST,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveDiscount tests
// ---------------------------------------------------------------------------

describe('resolveDiscount', () => {
  it('returns the discount for a valid, active, unexpired code', async () => {
    const db = makeMockDb([makeDiscount()]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('disc-1');
    expect(result!.code).toBe('SAVE10');
    expect(result!.amountType).toBe(ApDiscountAmountType.PERCENT);
    expect(result!.amount).toBe(10);
  });

  it('returns null for an unknown code', async () => {
    const db = makeMockDb([makeDiscount()]);
    const result = await resolveDiscount(db, 'DOESNOTEXIST');
    expect(result).toBeNull();
  });

  it('returns null for an inactive discount', async () => {
    const db = makeMockDb([makeDiscount({ active: false })]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).toBeNull();
  });

  it('returns null for a discount whose validTo is in the past (expired)', async () => {
    const db = makeMockDb([
      makeDiscount({ validFrom: new Date(PAST.getTime() - 86_400_000), validTo: PAST }),
    ]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).toBeNull();
  });

  it('returns null for a discount whose validFrom is in the future (not yet valid)', async () => {
    const db = makeMockDb([makeDiscount({ validFrom: FUTURE, validTo: FAR_FUTURE })]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).toBeNull();
  });

  it('returns null when maxUses is reached', async () => {
    const db = makeMockDb([makeDiscount({ maxUses: 5, usesCount: 5 })]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).toBeNull();
  });

  it('returns the discount when usesCount < maxUses', async () => {
    const db = makeMockDb([makeDiscount({ maxUses: 5, usesCount: 4 })]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).not.toBeNull();
  });

  it('returns the discount when maxUses is null (unlimited)', async () => {
    const db = makeMockDb([makeDiscount({ maxUses: null, usesCount: 9999 })]);
    const result = await resolveDiscount(db, 'SAVE10');
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyDiscount tests
// ---------------------------------------------------------------------------

describe('applyDiscount', () => {
  it('creates an application record and returns its id', async () => {
    const db = makeMockDb([makeDiscount()]);
    const appId = await applyDiscount(db, 'tenant-1', 'disc-1', null, 100);
    expect(appId).toMatch(/^app-/);
    expect(db._applications).toHaveLength(1);
    expect(db._applications[0].amountApplied).toBe(100);
    expect(db._applications[0].organizationId).toBe('tenant-1');
  });

  it('increments usesCount on the discount', async () => {
    const db = makeMockDb([makeDiscount({ usesCount: 2 })]);
    await applyDiscount(db, 'tenant-1', 'disc-1', null, 50);
    expect(db._discounts.get('disc-1')!.usesCount).toBe(3);
  });

  it('records the invoiceId when provided', async () => {
    const db = makeMockDb([makeDiscount()]);
    await applyDiscount(db, 'tenant-1', 'disc-1', 'inv-42', 200);
    expect(db._applications[0].invoiceId).toBe('inv-42');
  });
});

// ---------------------------------------------------------------------------
// listActive tests
// ---------------------------------------------------------------------------

describe('listActive', () => {
  it('returns only active, non-expired discounts', async () => {
    const db = makeMockDb([
      makeDiscount({ id: 'disc-1', code: 'VALID' }),
      makeDiscount({ id: 'disc-2', code: 'EXPIRED', validTo: PAST }),
      makeDiscount({ id: 'disc-3', code: 'INACTIVE', active: false }),
    ]);
    const results = await listActive(db);
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('VALID');
  });

  it('excludes discounts at max uses', async () => {
    const db = makeMockDb([
      makeDiscount({ id: 'disc-1', code: 'MAXED', maxUses: 3, usesCount: 3 }),
      makeDiscount({ id: 'disc-2', code: 'OPEN', maxUses: 3, usesCount: 2 }),
    ]);
    const results = await listActive(db);
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('OPEN');
  });

  it('returns empty array when no discounts are active', async () => {
    const db = makeMockDb([]);
    const results = await listActive(db);
    expect(results).toHaveLength(0);
  });
});
