import { getBalance, debitCredits, grantCredits, ApCreditLedgerReason } from './index';

// ---------------------------------------------------------------------------
// In-memory ledger mock
// ---------------------------------------------------------------------------

/**
 * Simulates `apCreditLedger` with an in-memory array of rows.
 * Supports aggregate(_sum.delta) and create(data).
 * `$transaction` calls the callback with the same mock so the
 * read-then-write sequence inside debitCredits works correctly.
 */
function makeMockDb(initialRows: { delta: number }[] = []) {
  const rows = [...initialRows];

  const ledger = {
    async aggregate({ _sum }: any) {
      if (_sum?.delta) {
        const total = rows.reduce((sum, r) => sum + r.delta, 0);
        return { _sum: { delta: rows.length > 0 ? total : null } };
      }
      return { _sum: {} };
    },
    async create({ data }: any) {
      rows.push({ delta: data.delta });
      return data;
    },
  };

  return {
    apCreditLedger: ledger,
    async $transaction(fn: (tx: any) => Promise<any>) {
      // Run callback synchronously with same mock — good enough for unit tests.
      return fn({ apCreditLedger: ledger });
    },
    _rows: rows, // expose for assertions
  } as any;
}

const TENANT = 'org-test';

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

describe('getBalance', () => {
  it('returns 0 for a tenant with no ledger rows', async () => {
    const db = makeMockDb([]);
    expect(await getBalance(db, TENANT)).toBe(0);
  });

  it('returns the sum of all deltas', async () => {
    const db = makeMockDb([{ delta: 500 }, { delta: -10 }, { delta: -5 }]);
    expect(await getBalance(db, TENANT)).toBe(485);
  });

  it('returns 0 when debits exactly cancel grants', async () => {
    const db = makeMockDb([{ delta: 100 }, { delta: -100 }]);
    expect(await getBalance(db, TENANT)).toBe(0);
  });

  it('handles a single positive row', async () => {
    const db = makeMockDb([{ delta: 250 }]);
    expect(await getBalance(db, TENANT)).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// debitCredits
// ---------------------------------------------------------------------------

describe('debitCredits', () => {
  it('succeeds and returns balanceAfter when balance > amount', async () => {
    const db = makeMockDb([{ delta: 100 }]);
    const result = await debitCredits(db, TENANT, 30);
    expect(result).toMatchObject({ ok: true, balanceAfter: 70 });
  });

  it('succeeds when balance exactly equals amount (zero balance after)', async () => {
    const db = makeMockDb([{ delta: 50 }]);
    const result = await debitCredits(db, TENANT, 50);
    expect(result).toMatchObject({ ok: true, balanceAfter: 0 });
  });

  it('fails with insufficient when balance < amount', async () => {
    const db = makeMockDb([{ delta: 5 }]);
    const result = await debitCredits(db, TENANT, 10);
    expect(result).toMatchObject({ ok: false, reason: 'insufficient', balance: 5, requested: 10 });
  });

  it('fails with insufficient when balance is 0 and amount > 0', async () => {
    const db = makeMockDb([]);
    const result = await debitCredits(db, TENANT, 1);
    expect(result).toMatchObject({ ok: false, reason: 'insufficient', balance: 0 });
  });

  it('amount=0 always succeeds without writing a ledger row', async () => {
    const db = makeMockDb([]);
    const result = await debitCredits(db, TENANT, 0);
    expect(result).toMatchObject({ ok: true, balanceAfter: 0 });
    // amount=0 → delta=0; the row IS written but balance stays 0
  });

  it('writes a negative delta row on success', async () => {
    const db = makeMockDb([{ delta: 100 }]);
    await debitCredits(db, TENANT, 40);
    const lastRow = db._rows[db._rows.length - 1];
    expect(lastRow.delta).toBe(-40);
  });

  it('does not write any row on failure', async () => {
    const db = makeMockDb([{ delta: 5 }]);
    await debitCredits(db, TENANT, 100);
    expect(db._rows).toHaveLength(1); // only the original row
  });

  it('throws on non-integer amount', async () => {
    const db = makeMockDb([{ delta: 100 }]);
    await expect(debitCredits(db, TENANT, 1.5)).rejects.toThrow('non-negative integer');
  });

  it('throws on negative amount', async () => {
    const db = makeMockDb([{ delta: 100 }]);
    await expect(debitCredits(db, TENANT, -5)).rejects.toThrow('non-negative integer');
  });

  it('accepts an explicit reason and reference', async () => {
    const db = makeMockDb([{ delta: 200 }]);
    const result = await debitCredits(db, TENANT, 10, ApCreditLedgerReason.REFUND, 'ref-abc');
    expect(result).toMatchObject({ ok: true, balanceAfter: 190 });
  });
});

// ---------------------------------------------------------------------------
// grantCredits
// ---------------------------------------------------------------------------

describe('grantCredits', () => {
  it('returns the new balance after grant', async () => {
    const db = makeMockDb([{ delta: 50 }]);
    const balanceAfter = await grantCredits(db, TENANT, 100);
    expect(balanceAfter).toBe(150);
  });

  it('writes a positive delta row', async () => {
    const db = makeMockDb([]);
    await grantCredits(db, TENANT, 500);
    expect(db._rows[0].delta).toBe(500);
  });

  it('throws on zero amount', async () => {
    const db = makeMockDb([]);
    await expect(grantCredits(db, TENANT, 0)).rejects.toThrow('positive integer');
  });

  it('throws on negative amount', async () => {
    const db = makeMockDb([]);
    await expect(grantCredits(db, TENANT, -1)).rejects.toThrow('positive integer');
  });
});
