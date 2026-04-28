import { createRejectDraftTool } from './reject_draft';
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

const tool = createRejectDraftTool();

describe('reject_draft tool', () => {
  test('tool name is reject_draft', () => {
    expect(tool.name).toBe('reject_draft');
  });

  test('returns "not found" when draft missing', async () => {
    const ctx = makeCtx(null);
    const result = await tool.handler(ctx, { id: 'x' });
    expect(result.data?.rejected).toBe(false);
  });

  test('rejects PUBLISHED draft with guard message', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PUBLISHED', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd1' });
    expect(result.data?.rejected).toBe(false);
    expect(ctx.db.apPostCandidate.update).not.toHaveBeenCalled();
  });

  test('sets status FAILED on PENDING draft', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1' });
    expect(ctx.db.apPostCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  test('also rejects SCHEDULED drafts', async () => {
    const ctx = makeCtx({ id: 'd2', status: 'SCHEDULED', metadata: {}, organizationId: 'org-1' });
    const result = await tool.handler(ctx, { id: 'd2' });
    expect(result.data?.rejected).toBe(true);
  });

  test('stamps rejection_reason when provided', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1', reason: 'off-brand' });
    const updateData = (ctx.db.apPostCandidate.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.metadata.rejection_reason).toBe('off-brand');
  });

  test('emits action_result with ok=true', async () => {
    const ctx = makeCtx({ id: 'd1', status: 'PENDING', metadata: {}, organizationId: 'org-1' });
    await tool.handler(ctx, { id: 'd1' });
    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'reject_draft', ok: true }),
    );
  });
});
