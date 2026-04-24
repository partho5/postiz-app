import { createListScheduledPostsTool } from './list_scheduled_posts';
import type { OrchestratorContext } from '../types';

const NOW = new Date('2026-04-23T20:00:00Z');

function makeCtx(slots: Array<{
  id: string;
  platform: string;
  scheduledAt: Date;
  status: string;
  postCandidate: { content: string } | null;
}>): {
  ctx: OrchestratorContext;
  emitted: any[];
  findMany: jest.Mock;
} {
  const emitted: any[] = [];
  const findMany = jest.fn().mockResolvedValue(slots);
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apScheduledSlot: { findMany },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'America/New_York',
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
  return { ctx, emitted, findMany };
}

describe('list_scheduled_posts tool', () => {
  test('emits scheduled_list event with mapped posts', async () => {
    const { ctx, emitted } = makeCtx([
      {
        id: 's-1',
        platform: 'twitter',
        scheduledAt: new Date('2026-04-24T13:00:00Z'),
        status: 'PENDING',
        postCandidate: { content: 'Hello world' },
      },
      {
        id: 's-2',
        platform: 'linkedin',
        scheduledAt: new Date('2026-04-25T17:00:00Z'),
        status: 'PENDING',
        postCandidate: { content: 'Big news' },
      },
    ]);
    const tool = createListScheduledPostsTool();
    const result = await tool.handler(ctx, {});

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('scheduled_list');
    expect(emitted[0].posts).toEqual([
      {
        id: 's-1',
        platform: 'twitter',
        content: 'Hello world',
        scheduledAt: '2026-04-24T13:00:00.000Z',
        status: 'PENDING',
      },
      {
        id: 's-2',
        platform: 'linkedin',
        content: 'Big news',
        scheduledAt: '2026-04-25T17:00:00.000Z',
        status: 'PENDING',
      },
    ]);

    expect(result.data?.count).toBe(2);
    expect(result.observation).toMatch(/Found 2 upcoming/);
    expect(result.observation).toContain('twitter');
    expect(result.observation).toContain('Hello world');
    expect(result.emitted).toBe(true);
  });

  test('handles missing post candidate gracefully', async () => {
    const { ctx } = makeCtx([
      {
        id: 's-1',
        platform: 'twitter',
        scheduledAt: new Date('2026-04-24T13:00:00Z'),
        status: 'PENDING',
        postCandidate: null,
      },
    ]);
    const tool = createListScheduledPostsTool();
    const result = await tool.handler(ctx, {});
    expect(result.data?.posts[0].content).toBe('');
  });

  test('reports empty queue with default-friendly observation', async () => {
    const { ctx, emitted } = makeCtx([]);
    const tool = createListScheduledPostsTool();
    const result = await tool.handler(ctx, {});
    expect(emitted[0].posts).toEqual([]);
    expect(result.observation).toMatch(/Nothing scheduled in the next 14 day/);
  });

  test('reports empty queue per-platform when filter is set', async () => {
    const { ctx } = makeCtx([]);
    const tool = createListScheduledPostsTool();
    const result = await tool.handler(ctx, {
      platform: 'linkedin',
      daysAhead: 7,
    });
    expect(result.observation).toBe(
      'No scheduled linkedin posts in the next 7 day(s).',
    );
  });

  test('passes platform + horizon to the prisma query', async () => {
    const { ctx, findMany } = makeCtx([]);
    const tool = createListScheduledPostsTool();
    await tool.handler(ctx, { platform: 'twitter', daysAhead: 3, limit: 5 });
    const args = findMany.mock.calls[0][0];
    expect(args.where.platform).toBe('twitter');
    expect(args.where.scheduledAt.gte).toEqual(NOW);
    expect(args.where.scheduledAt.lte.getTime()).toBe(
      NOW.getTime() + 3 * 24 * 60 * 60_000,
    );
    expect(args.take).toBe(5);
  });

  test('caps daysAhead and limit via schema', () => {
    const tool = createListScheduledPostsTool();
    expect(() => tool.parameters.parse({ daysAhead: 0 })).toThrow();
    expect(() => tool.parameters.parse({ daysAhead: 100 })).toThrow();
    expect(() => tool.parameters.parse({ limit: 0 })).toThrow();
    expect(() => tool.parameters.parse({ limit: 999 })).toThrow();
  });
});
