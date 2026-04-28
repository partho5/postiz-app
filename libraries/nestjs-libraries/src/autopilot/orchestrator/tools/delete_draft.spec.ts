import { createDeleteDraftTool } from './delete_draft';
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

const tool = createDeleteDraftTool();

describe('delete_draft tool', () => {
  test('tool name is delete_draft', () => {
    expect(tool.name).toBe('delete_draft');
  });

  test('returns "not found" when draft missing', async () => {
    const ctx = makeCtx(null);
    const result = await tool.handler(ctx, { id: 'x' });
    expect(result.data?.deleted).toBe(false);
    expect(result.observation).toMatch(/not found/i);
  });

  test('rejects delete on PUBLISHED draft', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PUBLISHED', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1' });
    expect(result.data?.deleted).toBe(false);
    expect(ctx.db.apPostCandidate.update).not.toHaveBeenCalled();
  });

  test('deletes PENDING draft by setting status FAILED', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1' });
    expect(ctx.db.apPostCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(result.data?.deleted).toBe(true);
  });

  test('also deletes SCHEDULED drafts', async () => {
    const ctx = makeCtx({ id: 'd2', status: 'SCHEDULED', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd2' });
    expect(result.data?.deleted).toBe(true);
  });

  test('emits action_result', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1' });
    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'delete_draft', ok: true }),
    );
  });
});
