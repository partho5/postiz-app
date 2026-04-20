/**
 * Unit tests for the stock keeper agent — slice 2.8
 *
 * assessStock is a pure synchronous function (no DB, no LLM) so tests are
 * fast and deterministic.  runStockKeeper and the AgentDefinition shape are
 * smoke-tested to verify the async wrapper and registry contract.
 */

import { assessStock, runStockKeeper, stockKeeperAgent } from './stock-keeper';
import type { AgentContext } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): AgentContext {
  return {
    tenant: { id: 'tenant-x' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// assessStock — pure depth check
// ---------------------------------------------------------------------------

describe('assessStock', () => {
  it('returns ok when depth equals minDepth (exact boundary)', () => {
    const result = assessStock({
      tenantId: 't1',
      platform: 'twitter',
      currentDepth: 5,
      minDepth: 5,
    });
    expect(result.action).toBe('ok');
    expect(result.deficit).toBe(0);
  });

  it('returns ok when depth exceeds minDepth', () => {
    const result = assessStock({
      tenantId: 't1',
      platform: 'twitter',
      currentDepth: 10,
      minDepth: 3,
    });
    expect(result.action).toBe('ok');
    expect(result.deficit).toBe(0);
  });

  it('returns refill when depth is one below minDepth', () => {
    const result = assessStock({
      tenantId: 't1',
      platform: 'linkedin',
      currentDepth: 4,
      minDepth: 5,
    });
    expect(result.action).toBe('refill');
    expect(result.deficit).toBe(1);
  });

  it('returns refill with correct deficit when depth is well below minDepth', () => {
    const result = assessStock({
      tenantId: 't1',
      platform: 'twitter',
      currentDepth: 1,
      minDepth: 5,
    });
    expect(result.action).toBe('refill');
    expect(result.deficit).toBe(4);
  });

  it('returns refill with full deficit when stack is empty', () => {
    const result = assessStock({
      tenantId: 't1',
      platform: 'instagram',
      currentDepth: 0,
      minDepth: 3,
    });
    expect(result.action).toBe('refill');
    expect(result.deficit).toBe(3);
  });

  it('echoes tenantId, platform, currentDepth, and minDepth into the output', () => {
    const input = {
      tenantId: 'org-42',
      platform: 'instagram',
      currentDepth: 2,
      minDepth: 4,
    };
    const result = assessStock(input);
    expect(result.tenantId).toBe('org-42');
    expect(result.platform).toBe('instagram');
    expect(result.currentDepth).toBe(2);
    expect(result.minDepth).toBe(4);
  });

  it('deficit is never negative when depth greatly exceeds minDepth', () => {
    const result = assessStock({
      tenantId: 't1',
      platform: 'twitter',
      currentDepth: 100,
      minDepth: 3,
    });
    expect(result.deficit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runStockKeeper — async AgentDefinition wrapper
// ---------------------------------------------------------------------------

describe('runStockKeeper', () => {
  it('delegates to assessStock and resolves to the same output', async () => {
    const ctx = makeCtx();
    const result = await runStockKeeper(ctx, {
      tenantId: 't1',
      platform: 'twitter',
      currentDepth: 0,
      minDepth: 5,
    });
    expect(result.action).toBe('refill');
    expect(result.deficit).toBe(5);
  });

  it('returns ok when stack is healthy', async () => {
    const ctx = makeCtx();
    const result = await runStockKeeper(ctx, {
      tenantId: 't1',
      platform: 'linkedin',
      currentDepth: 7,
      minDepth: 3,
    });
    expect(result.action).toBe('ok');
    expect(result.deficit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AgentDefinition shape smoke test
// ---------------------------------------------------------------------------

describe('stockKeeperAgent shape', () => {
  it('has id stock_keeper', () => {
    expect(stockKeeperAgent.id).toBe('stock_keeper');
  });

  it('has a non-empty systemPrompt', () => {
    expect(typeof stockKeeperAgent.systemPrompt).toBe('string');
    expect(stockKeeperAgent.systemPrompt.length).toBeGreaterThan(10);
  });

  it('has an empty allowedSkills list (skeleton)', () => {
    expect(stockKeeperAgent.allowedSkills).toEqual([]);
  });

  it('run() resolves to a StockKeeperOutput', async () => {
    const ctx = makeCtx();
    const output = await stockKeeperAgent.run(ctx, {
      tenantId: 't1',
      platform: 'twitter',
      currentDepth: 3,
      minDepth: 3,
    });
    expect(output.action).toBe('ok');
    expect(typeof output.deficit).toBe('number');
  });
});
