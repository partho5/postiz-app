import { createReschedulePostTool } from './reschedule_post';
import type { OrchestratorContext } from '../types';

const NOW = new Date('2026-04-24T12:00:00Z');

const PENDING_SLOT = {
  id: 'slot-1',
  platform: 'linkedin',
  status: 'PENDING',
  scheduledAt: new Date('2026-04-25T09:00:00Z'),
  metadata: {},
};

function makeCtx(opts: {
  slot?: typeof PENDING_SLOT | null;
  collision?: boolean;
}): { ctx: OrchestratorContext; update: jest.Mock; emitted: unknown[] } {
  const emitted: unknown[] = [];
  const update = jest.fn().mockResolvedValue(undefined);
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apScheduledSlot: {
        findFirst: jest.fn((args: { where?: { id?: string; platform?: string } }) => {
          // collision check has `id: { not: ... }` in the where clause
          if (args?.where && 'platform' in args.where && !('id' in args.where)) {
            return Promise.resolve(opts.collision ? { id: 'other' } : null);
          }
          // Prisma `id: { not: ... }` shape for collision check
          if (args?.where?.id && typeof args.where.id === 'object') {
            return Promise.resolve(opts.collision ? { id: 'other' } : null);
          }
          return Promise.resolve(opts.slot ?? null);
        }),
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

describe('reschedule_post — happy path', () => {
  test('updates scheduledAt and emits action_result', async () => {
    const { ctx, update, emitted } = makeCtx({ slot: PENDING_SLOT });
    const tool = createReschedulePostTool();

    const result = await tool.handler(ctx, {
      slotId: 'slot-1',
      when: 'tomorrow 3pm',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'slot-1' },
        data: expect.objectContaining({
          scheduledAt: expect.any(Date),
        }),
      }),
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: 'action_result',
      action: 'reschedule_post',
      ok: true,
    });
    expect(result.data?.rescheduled).toBe(true);
    expect(result.emitted).toBe(true);
  });

  test('resolves ISO time correctly', async () => {
    const { ctx, update } = makeCtx({ slot: PENDING_SLOT });
    const tool = createReschedulePostTool();

    await tool.handler(ctx, {
      slotId: 'slot-1',
      when: '2026-04-26T10:00:00Z',
    });

    const data = update.mock.calls[0][0].data;
    expect(data.scheduledAt).toEqual(new Date('2026-04-26T10:00:00Z'));
  });

  test('carries rescheduledFrom in metadata', async () => {
    const { ctx, update } = makeCtx({ slot: PENDING_SLOT });
    const tool = createReschedulePostTool();

    await tool.handler(ctx, { slotId: 'slot-1', when: 'next Monday 9am' });

    const meta = update.mock.calls[0][0].data.metadata;
    expect(meta.rescheduledFrom).toBe(PENDING_SLOT.scheduledAt.toISOString());
  });
});

describe('reschedule_post — guard rails', () => {
  test('rejects past time with explanation', async () => {
    const { ctx, update } = makeCtx({ slot: PENDING_SLOT });
    const tool = createReschedulePostTool();

    const result = await tool.handler(ctx, {
      slotId: 'slot-1',
      when: '2020-01-01T00:00:00Z',
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.data?.rescheduled).toBe(false);
    expect(result.observation).toMatch(/past/i);
  });

  test('rejects unparseable time', async () => {
    const { ctx, update } = makeCtx({ slot: PENDING_SLOT });
    const tool = createReschedulePostTool();

    const result = await tool.handler(ctx, {
      slotId: 'slot-1',
      when: 'gibberish phrase',
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.data?.rescheduled).toBe(false);
  });

  test('returns no-op when slot not found', async () => {
    const { ctx, update } = makeCtx({ slot: null });
    const tool = createReschedulePostTool();

    const result = await tool.handler(ctx, {
      slotId: 'no-such',
      when: 'tomorrow 9am',
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.data?.rescheduled).toBe(false);
    expect(result.observation).toMatch(/no scheduled post found/i);
  });

  test('rejects non-PENDING slot', async () => {
    const { ctx, update } = makeCtx({
      slot: { ...PENDING_SLOT, status: 'TRIGGERED' },
    });
    const tool = createReschedulePostTool();

    const result = await tool.handler(ctx, {
      slotId: 'slot-1',
      when: 'tomorrow 9am',
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.data?.rescheduled).toBe(false);
    expect(result.observation.toLowerCase()).toMatch(/triggered/);
  });
});

describe('reschedule_post — schema', () => {
  test('requires slotId and when', () => {
    const tool = createReschedulePostTool();
    expect(() => tool.parameters.parse({})).toThrow();
    expect(() => tool.parameters.parse({ slotId: 'x' })).toThrow();
    expect(() => tool.parameters.parse({ when: 'tomorrow' })).toThrow();
  });
});
