import { runSkill, PipelineContext, registerSkillGate } from './pipeline';
import { SKILL_COSTS } from './skill-costs';
import type { SkillRegistry } from './skills/types';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/** Minimal Prisma mock that returns a configurable credit balance. */
function makeMockDb(balance: number) {
  return {
    apCreditLedger: {
      async aggregate() {
        return { _sum: { delta: balance } };
      },
    },
  } as any;
}

const TENANT = { id: 'org-1' } as any;
const USER = { id: 'user-1' } as any;
const LOGGER = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const LLM = { complete: jest.fn() };

function makeCtx(balance: number, tierId = 'free'): PipelineContext {
  return {
    tenant: TENANT,
    user: USER,
    db: makeMockDb(balance),
    llm: LLM,
    logger: LOGGER,
    tierId,
  };
}

const PASS_SKILL = {
  id: 'test-pass',
  description: 'always succeeds',
  handler: async () => 'done',
};

const THROW_SKILL = {
  id: 'test-throw',
  description: 'always throws',
  handler: async () => { throw new Error('handler blew up'); },
};

const REGISTRY: SkillRegistry = {
  'test-pass': PASS_SKILL,
  'test-throw': THROW_SKILL,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSkill pipeline', () => {
  afterEach(() => {
    delete SKILL_COSTS['test-pass'];
    delete SKILL_COSTS['test-throw'];
    registerSkillGate('test-pass', null); // clear any gate set in a test
  });

  // ---- pass path -----------------------------------------------------------

  it('returns ok=true when both gates pass', async () => {
    // cost=0 (default), balance=0 → 0 >= 0 → passes
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
    // free tier does NOT include 'article_ingestion'
    registerSkillGate('test-pass', 'article_ingestion');
    const result = await runSkill('test-pass', makeCtx(1000, 'free'), undefined, REGISTRY);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, reason: 'plan_gate' });
    expect((result as any).message).toContain('article_ingestion');
  });

  it('passes plan gate when the tier has the required feature', async () => {
    // free tier includes 'extension'
    registerSkillGate('test-pass', 'extension');
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
});
