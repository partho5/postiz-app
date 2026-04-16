import { runSkill, PipelineContext, registerSkillGate } from './pipeline';
import { SKILL_COSTS } from './skill-costs';
import type { SkillRegistry } from './skills/types';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/**
 * Mock db that supports every operation the pipeline delegates to:
 *   - apCreditLedger.aggregate  (getBalance)
 *   - $transaction              (debitCredits)
 *   - apActivityLog.create      (logActivity)
 *   - apCapabilityGap.create    (logGap)
 */
function makeMockDb(balance: number) {
  const ledgerRows: { delta: number }[] = balance !== 0 ? [{ delta: balance }] : [];

  const ledger = {
    async aggregate() {
      const total = ledgerRows.reduce((s, r) => s + r.delta, 0);
      return { _sum: { delta: ledgerRows.length > 0 ? total : null } };
    },
    async create({ data }: any) {
      ledgerRows.push({ delta: data.delta });
      return data;
    },
  };

  return {
    apCreditLedger: ledger,
    apActivityLog: { create: jest.fn().mockResolvedValue({}) },
    apCapabilityGap: { create: jest.fn().mockResolvedValue({}) },
    async $transaction(fn: (tx: any) => Promise<any>) {
      return fn({ apCreditLedger: ledger });
    },
  } as any;
}

const TENANT = { id: 'org-1' } as any;
const USER = { id: 'user-1' } as any;
const LOGGER = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const LLM = { model: {} as any, complete: jest.fn() };

function makeCtx(balance: number, tierId = 'free', userMessage = ''): PipelineContext {
  return { tenant: TENANT, user: USER, db: makeMockDb(balance), llm: LLM, logger: LOGGER, tierId, userMessage };
}

const PASS_SKILL = { id: 'test-pass', description: 'always succeeds', handler: async () => 'done' };
const THROW_SKILL = { id: 'test-throw', description: 'always throws', handler: async () => { throw new Error('handler blew up'); } };
const REGISTRY: SkillRegistry = { 'test-pass': PASS_SKILL, 'test-throw': THROW_SKILL };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSkill pipeline', () => {
  afterEach(() => {
    delete SKILL_COSTS['test-pass'];
    delete SKILL_COSTS['test-throw'];
    registerSkillGate('test-pass', null);
  });

  // ---- pass path -----------------------------------------------------------

  it('returns ok=true when both gates pass', async () => {
    const result = await runSkill('test-pass', makeCtx(0), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: true, value: 'done' });
  });

  it('passes when balance > cost', async () => {
    SKILL_COSTS['test-pass'] = 5;
    const result = await runSkill('test-pass', makeCtx(100), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: true, value: 'done' });
  });

  it('passes when balance exactly equals cost', async () => {
    SKILL_COSTS['test-pass'] = 7;
    const result = await runSkill('test-pass', makeCtx(7), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: true, value: 'done' });
  });

  // ---- plan gate -----------------------------------------------------------

  it('returns plan_gate failure when skill requires a feature the tier lacks', async () => {
    registerSkillGate('test-pass', 'article_ingestion'); // free tier lacks this
    const result = await runSkill('test-pass', makeCtx(1000, 'free'), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: false, reason: 'plan_gate' });
    expect((result as any).message).toContain('article_ingestion');
  });

  it('logs a capability gap on plan_gate failure', async () => {
    registerSkillGate('test-pass', 'article_ingestion');
    const ctx = makeCtx(1000, 'free', 'write me a report');
    await runSkill('test-pass', ctx, undefined, REGISTRY);
    expect(ctx.db.apCapabilityGap.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: expect.stringContaining('plan_gate') }) })
    );
  });

  it('passes plan gate when the tier has the required feature', async () => {
    registerSkillGate('test-pass', 'extension'); // free tier includes this
    const result = await runSkill('test-pass', makeCtx(0, 'free'), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: true, value: 'done' });
  });

  // ---- credit gate ---------------------------------------------------------

  it('returns insufficient_credits when balance < cost', async () => {
    SKILL_COSTS['test-pass'] = 10;
    const result = await runSkill('test-pass', makeCtx(5), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: false, reason: 'insufficient_credits' });
    expect((result as any).message).toContain('balance=5');
    expect((result as any).message).toContain('required=10');
  });

  it('returns insufficient_credits when balance is one short of cost', async () => {
    SKILL_COSTS['test-pass'] = 3;
    const result = await runSkill('test-pass', makeCtx(2), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: false, reason: 'insufficient_credits' });
  });

  it('logs a capability gap on insufficient_credits', async () => {
    SKILL_COSTS['test-pass'] = 10;
    const ctx = makeCtx(5, 'free', 'generate content');
    await runSkill('test-pass', ctx, undefined, REGISTRY);
    expect(ctx.db.apCapabilityGap.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: expect.stringContaining('insufficient_credits') }) })
    );
  });

  // ---- skill not found -----------------------------------------------------

  it('returns skill_not_found when skillId is absent from registry', async () => {
    const result = await runSkill('nonexistent-skill', makeCtx(100), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: false, reason: 'skill_not_found' });
  });

  // ---- handler error -------------------------------------------------------

  it('returns skill_error when the handler throws', async () => {
    const result = await runSkill('test-throw', makeCtx(100), undefined, REGISTRY);
    expect(result).toMatchObject({ ok: false, reason: 'skill_error' });
    expect((result as any).message).toBe('handler blew up');
  });

  it('logs activity with FAILURE status when handler throws', async () => {
    const ctx = makeCtx(100);
    await runSkill('test-throw', ctx, undefined, REGISTRY);
    expect(ctx.db.apActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILURE' }) })
    );
  });

  it('logs activity with SUCCESS status on the pass path', async () => {
    const ctx = makeCtx(100);
    await runSkill('test-pass', ctx, undefined, REGISTRY);
    expect(ctx.db.apActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) })
    );
  });
});
