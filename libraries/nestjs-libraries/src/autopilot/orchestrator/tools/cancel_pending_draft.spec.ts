import { createCancelPendingDraftTool } from './cancel_pending_draft';
import type { OrchestratorContext } from '../types';

function makeCtx(pending: { id: string } | null): {
  ctx: OrchestratorContext;
  cancelAction: jest.Mock;
} {
  const cancelAction = jest.fn().mockResolvedValue(undefined);
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPendingAction: {
        findUnique: jest.fn().mockResolvedValue(pending),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date(),
    timezone: 'UTC',
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
  return { ctx, cancelAction };
}

describe('cancel_pending_draft tool', () => {
  test('reports nothing-to-cancel when no pending action exists', async () => {
    const { ctx, cancelAction } = makeCtx(null);
    const tool = createCancelPendingDraftTool({
      directAction: { cancelAction },
    });

    const result = await tool.handler(ctx, {});

    expect(cancelAction).not.toHaveBeenCalled();
    expect(result.data).toEqual({ cancelled: false });
    expect(result.observation).toMatch(/nothing to cancel/i);
  });

  test('delegates to DirectActionHandler when a draft is pending', async () => {
    const { ctx, cancelAction } = makeCtx({ id: 'pa-1' });
    const tool = createCancelPendingDraftTool({
      directAction: { cancelAction },
    });

    const result = await tool.handler(ctx, { reason: 'user said never mind' });

    expect(cancelAction).toHaveBeenCalledWith('org-1');
    expect(result.data).toEqual({ cancelled: true });
    expect(result.observation).toMatch(/cancelled/i);
  });

  test('description warns it does not affect already-scheduled posts', () => {
    const { cancelAction } = makeCtx(null);
    const tool = createCancelPendingDraftTool({
      directAction: { cancelAction },
    });
    expect(tool.description.toLowerCase()).toMatch(/does not cancel/i);
  });
});
