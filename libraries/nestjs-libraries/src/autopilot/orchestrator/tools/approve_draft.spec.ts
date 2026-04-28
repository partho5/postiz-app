import { createApproveDraftTool } from './approve_draft';
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

const tool = createApproveDraftTool();

describe('approve_draft tool', () => {
  test('tool name is approve_draft', () => {
    expect(tool.name).toBe('approve_draft');
  });

  test('returns "not found" when draft missing', async () => {
    const ctx = makeCtx(null);
    const result = await tool.handler(ctx, { id: 'x' });
    expect(result.data?.approved).toBe(false);
  });

  test('rejects approval on non-PENDING draft', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PUBLISHED', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1' });
    expect(result.data?.approved).toBe(false);
    expect(ctx.db.apPostCandidate.update).not.toHaveBeenCalled();
  });

  test('boosts priority to 100 on PENDING draft', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1' });
    expect(ctx.db.apPostCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 100 }),
      }),
    );
  });

  test('stamps approved_by and approved_at in metadata', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1' });
    const updateData = (ctx.db.apPostCandidate.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.metadata).toMatchObject({ approved_by: 'user' });
    expect(updateData.metadata.approved_at).toBeDefined();
  });

  test('emits action_result with ok=true', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1' });
    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'approve_draft', ok: true }),
    );
  });

  test('returns approved=true on success', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1' });
    expect(result.data?.approved).toBe(true);
  });
});
