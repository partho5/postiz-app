import { logActivity, ApActivityLogStatus } from './index';

function makeMockDb() {
  const created: any[] = [];
  return {
    apActivityLog: {
      async create({ data }: any) {
        created.push(data);
        return data;
      },
    },
    _created: created,
  } as any;
}

describe('logActivity', () => {
  it('writes one row with required fields', async () => {
    const db = makeMockDb();
    await logActivity(db, {
      tenantId: 'org-1',
      skillId: 'generate_copy',
      status: ApActivityLogStatus.SUCCESS,
      creditsCharged: 5,
    });
    expect(db._created).toHaveLength(1);
    const row = db._created[0];
    expect(row.organizationId).toBe('org-1');
    expect(row.skillId).toBe('generate_copy');
    expect(row.status).toBe(ApActivityLogStatus.SUCCESS);
    expect(row.creditsCharged).toBe(5);
    expect(row.userId).toBeNull();
    expect(row.dollarCost).toBeNull();
  });

  it('passes optional fields when provided', async () => {
    const db = makeMockDb();
    await logActivity(db, {
      tenantId: 'org-2',
      userId: 'user-7',
      skillId: 'analyze',
      status: ApActivityLogStatus.FAILURE,
      creditsCharged: 0,
      llmModel: 'claude-sonnet-4-6',
      inputTokens: 120,
      outputTokens: 80,
      dollarCost: '0.001200',
      metadata: { error: 'timeout' },
    });
    const row = db._created[0];
    expect(row.userId).toBe('user-7');
    expect(row.llmModel).toBe('claude-sonnet-4-6');
    expect(row.inputTokens).toBe(120);
    expect(row.outputTokens).toBe(80);
    expect(row.dollarCost).toBeDefined();
    expect(row.metadata).toEqual({ error: 'timeout' });
  });

  it('defaults metadata to empty object when omitted', async () => {
    const db = makeMockDb();
    await logActivity(db, {
      tenantId: 'org-3',
      skillId: 'push_to_stack',
      status: ApActivityLogStatus.SUCCESS,
      creditsCharged: 1,
    });
    expect(db._created[0].metadata).toEqual({});
  });
});
