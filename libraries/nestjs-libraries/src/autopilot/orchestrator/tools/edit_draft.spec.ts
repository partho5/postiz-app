import { createEditDraftTool } from './edit_draft';
import type { OrchestratorContext } from '../types';

function makeCtx(findResult: Record<string, unknown> | null): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPostCandidate: {
        findFirst: jest.fn().mockResolvedValue(findResult),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-28T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

beforeEach(() => jest.clearAllMocks());

const tool = createEditDraftTool();

describe('edit_draft tool', () => {
  test('tool name is edit_draft', () => {
    expect(tool.name).toBe('edit_draft');
  });

  test('returns "not found" when draft missing', async () => {
    const ctx = makeCtx(null);
    const result = await tool.handler(ctx, { id: 'x', content: 'new' });
    expect(result.observation).toMatch(/not found/i);
    expect(result.data?.updated).toBe(false);
  });

  test('rejects edit on non-PENDING draft', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'RESERVED', organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1', content: 'new' });
    expect(result.observation).toContain('RESERVED');
    expect(result.data?.updated).toBe(false);
    expect(ctx.db.apPostCandidate.update).not.toHaveBeenCalled();
  });

  test('updates content on PENDING draft', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1', content: 'Updated content' });
    expect(ctx.db.apPostCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { content: 'Updated content' } }),
    );
    expect(result.data?.updated).toBe(true);
  });

  test('emits action_result with ok=true', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1', content: 'new content' });
    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  test('observation mentions draft id', async () => {
    const ctx = makeCtx({ id: 'my-draft', status: 'PENDING', organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'my-draft', content: 'updated' });
    expect(result.observation).toContain('my-draft');
  });
});
