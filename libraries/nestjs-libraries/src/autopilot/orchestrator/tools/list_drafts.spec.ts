import { createListDraftsTool } from './list_drafts';
import type { OrchestratorContext } from '../types';

function makeRow(overrides: Partial<{ id: string; platform: string; content: string; source: string; priority: number }> = {}) {
  return {
    id: 'draft-1',
    platform: 'linkedin',
    content: 'Hello world post content',
    status: 'PENDING' as const,
    source: 'copywriter',
    priority: 0,
    createdAt: new Date('2026-04-28T08:00:00Z'),
    ...overrides,
  };
}

function makeCtx(rows: ReturnType<typeof makeRow>[] = []): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPostCandidate: { findMany: jest.fn().mockResolvedValue(rows) },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-28T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

beforeEach(() => jest.clearAllMocks());

const tool = createListDraftsTool();

describe('list_drafts tool', () => {
  test('tool name is list_drafts', () => {
    expect(tool.name).toBe('list_drafts');
  });

  test('returns "no drafts" observation when empty', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, {});
    expect(result.observation).toMatch(/no pending drafts/i);
    expect(result.data?.count).toBe(0);
  });

  test('returns platform-scoped "no drafts" when filter matches nothing', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, { platform: 'twitter' });
    expect(result.observation).toContain('twitter');
  });

  test('lists drafts with snippet and id', async () => {
    const ctx = makeCtx([makeRow({ id: 'abc', content: 'My great post about AI' })]);
    const result = await tool.handler(ctx, {});
    expect(result.observation).toContain('abc');
    expect(result.observation).toContain('My great post about AI');
    expect(result.data?.count).toBe(1);
  });

  test('truncates long content to 80 chars with ellipsis', async () => {
    const long = 'x'.repeat(120);
    const ctx = makeCtx([makeRow({ content: long })]);
    const result = await tool.handler(ctx, {});
    expect(result.data!.drafts[0].contentSnippet).toHaveLength(81);
    expect(result.data!.drafts[0].contentSnippet.endsWith('…')).toBe(true);
  });

  test('passes platform filter to DB query', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, { platform: 'instagram' });
    expect(ctx.db.apPostCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ platform: 'instagram' }) }),
    );
  });

  test('does not emit a UI card', async () => {
    const ctx = makeCtx([makeRow()]);
    await tool.handler(ctx, {});
    expect((ctx.emit as jest.Mock).mock.calls).toHaveLength(0);
  });
});
