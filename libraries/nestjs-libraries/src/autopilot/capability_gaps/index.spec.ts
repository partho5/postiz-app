import { logGap } from './index';

function makeMockDb() {
  const created: any[] = [];
  return {
    apCapabilityGap: {
      async create({ data }: any) {
        created.push(data);
        return data;
      },
    },
    _created: created,
  } as any;
}

describe('logGap', () => {
  it('writes one row with all required fields', async () => {
    const db = makeMockDb();
    await logGap(db, {
      tenantId: 'org-1',
      userMessage: 'run a deep research report',
      attemptedSkills: ['apify_deep_research'],
      reason: 'plan_gate:apify_deep_research',
    });
    expect(db._created).toHaveLength(1);
    const row = db._created[0];
    expect(row.organizationId).toBe('org-1');
    expect(row.userMessage).toBe('run a deep research report');
    expect(row.attemptedSkills).toEqual(['apify_deep_research']);
    expect(row.reason).toBe('plan_gate:apify_deep_research');
  });

  it('stores multiple attempted skills', async () => {
    const db = makeMockDb();
    await logGap(db, {
      tenantId: 'org-2',
      userMessage: 'post everywhere',
      attemptedSkills: ['push_to_stack', 'fan_out'],
      reason: 'insufficient_credits:balance=0,cost=10',
    });
    expect(db._created[0].attemptedSkills).toHaveLength(2);
  });

  it('accepts an empty userMessage', async () => {
    const db = makeMockDb();
    await expect(
      logGap(db, { tenantId: 'org-3', userMessage: '', attemptedSkills: [], reason: 'test' })
    ).resolves.toBeUndefined();
  });
});
