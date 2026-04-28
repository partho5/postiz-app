import { createReadDraftTool } from './read_draft';
import type { OrchestratorContext } from '../types';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    platform: 'linkedin',
    content: 'Full post content here',
    status: 'PENDING',
    source: 'copywriter',
    priority: 0,
    expiresAt: null as Date | null,
    createdAt: new Date('2026-04-28T08:00:00Z'),
    metadata: {},
    ...overrides,
  };
}

function makeCtx(row: ReturnType<typeof makeRow> | null): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPostCandidate: { findFirst: jest.fn().mockResolvedValue(row) },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-28T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

beforeEach(() => jest.clearAllMocks());

const tool = createReadDraftTool();

describe('read_draft tool', () => {
  test('tool name is read_draft', () => {
    expect(tool.name).toBe('read_draft');
  });

  test('returns "not found" observation when draft does not exist', async () => {
    const ctx = makeCtx(null);
    const result = await tool.handler(ctx, { id: 'missing' });
    expect(result.observation).toMatch(/not found/i);
    expect(result.data?.found).toBe(false);
  });

  test('returns full content in observation', async () => {
    const ctx = makeCtx(makeRow());
    const result = await tool.handler(ctx, { id: 'draft-1' });
    expect(result.observation).toContain('Full post content here');
    expect(result.data?.found).toBe(true);
  });

  test('includes platform and status in observation', async () => {
    const ctx = makeCtx(makeRow({ platform: 'twitter', status: 'PENDING' }));
    const result = await tool.handler(ctx, { id: 'draft-1' });
    expect(result.observation).toContain('twitter');
    expect(result.observation).toContain('PENDING');
  });

  test('serialises expiresAt as ISO string when set', async () => {
    const expires = new Date('2026-05-01T00:00:00Z');
    const ctx = makeCtx(makeRow({ expiresAt: expires }));
    const result = await tool.handler(ctx, { id: 'draft-1' });
    expect(result.data?.draft?.expiresAt).toBe(expires.toISOString());
  });

  test('does not emit a UI card', async () => {
    const ctx = makeCtx(makeRow());
    await tool.handler(ctx, { id: 'draft-1' });
    expect((ctx.emit as jest.Mock).mock.calls).toHaveLength(0);
  });
});
