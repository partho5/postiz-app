import { createCancelScheduledPostTool } from './cancel_scheduled_post';
import type { OrchestratorContext } from '../types';

const NOW = new Date('2026-04-24T12:00:00Z');

function makeCtx(opts: {
  slot?: {
    id: string;
    platform: string;
    status: string;
    scheduledAt: Date;
    metadata?: Record<string, unknown>;
  } | null;
}): { ctx: OrchestratorContext; update: jest.Mock; emitted: unknown[] } {
  const emitted: unknown[] = [];
  const update = jest.fn().mockResolvedValue(undefined);
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apScheduledSlot: {
        findFirst: jest.fn().mockResolvedValue(opts.slot ?? null),
        update,
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
  return { ctx, update, emitted };
}

const PENDING_SLOT = {
  id: 'slot-1',
  platform: 'twitter',
  status: 'PENDING',
  scheduledAt: new Date('2026-04-25T09:00:00Z'),
  metadata: {},
};

describe('cancel_scheduled_post — happy path', () => {
  test('updates slot to CANCELLED and emits action_result', async () => {
    const { ctx, update, emitted } = makeCtx({ slot: PENDING_SLOT });
    const tool = createCancelScheduledPostTool();

    const result = await tool.handler(ctx, { slotId: 'slot-1' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'slot-1' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: 'action_result',
      action: 'cancel_scheduled_post',
      ok: true,
    });
    expect(result.data?.cancelled).toBe(true);
    expect(result.data?.platform).toBe('twitter');
    expect(result.emitted).toBe(true);
  });

  test('observation contains platform name', async () => {
    const { ctx } = makeCtx({ slot: PENDING_SLOT });
    const tool = createCancelScheduledPostTool();
    const result = await tool.handler(ctx, { slotId: 'slot-1' });
    expect(result.observation).toMatch(/twitter/i);
  });
});

describe('cancel_scheduled_post — not found', () => {
  test('returns cancelled=false observation when slot does not exist', async () => {
    const { ctx, update, emitted } = makeCtx({ slot: null });
    const tool = createCancelScheduledPostTool();

    const result = await tool.handler(ctx, { slotId: 'no-such-id' });

    expect(update).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
    expect(result.data?.cancelled).toBe(false);
    expect(result.observation).toMatch(/no scheduled post found/i);
  });
});

describe('cancel_scheduled_post — non-pending statuses', () => {
  test.each(['TRIGGERED', 'CANCELLED', 'SKIPPED'] as const)(
    'returns no-op for status=%s',
    async (status) => {
      const { ctx, update, emitted } = makeCtx({
        slot: { ...PENDING_SLOT, status },
      });
      const tool = createCancelScheduledPostTool();
      const result = await tool.handler(ctx, { slotId: 'slot-1' });

      expect(update).not.toHaveBeenCalled();
      expect(emitted).toHaveLength(0);
      expect(result.data?.cancelled).toBe(false);
      expect(result.observation.toLowerCase()).toContain(status.toLowerCase());
    },
  );
});

describe('cancel_scheduled_post — schema', () => {
  test('rejects empty slotId', () => {
    const tool = createCancelScheduledPostTool();
    expect(() => tool.parameters.parse({ slotId: '' })).toThrow();
  });

  test('reason is optional', () => {
    const tool = createCancelScheduledPostTool();
    expect(() => tool.parameters.parse({ slotId: 'abc' })).not.toThrow();
    expect(() =>
      tool.parameters.parse({ slotId: 'abc', reason: 'changed mind' }),
    ).not.toThrow();
  });

  test('description distinguishes from cancel_pending_draft and rollback', () => {
    const tool = createCancelScheduledPostTool();
    expect(tool.description.toLowerCase()).toMatch(/draft/);
    expect(tool.description.toLowerCase()).toMatch(/rollback/);
  });
});
