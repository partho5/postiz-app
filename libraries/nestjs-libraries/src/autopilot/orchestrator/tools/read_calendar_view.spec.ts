import { createReadCalendarViewTool } from './read_calendar_view';
import type { OrchestratorContext } from '../types';

function makeCtx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  const slots: any[] = [];
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {
      apScheduledSlot: {
        findMany: jest.fn().mockResolvedValue(slots),
      },
    } as any,
    llm: {} as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T08:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    ...overrides,
  };
}

describe('read_calendar_view', () => {
  const tool = createReadCalendarViewTool();

  it('has correct name and description', () => {
    expect(tool.name).toBe('read_calendar_view');
    expect(tool.description).toContain('calendar');
    expect(tool.description).toContain('list_scheduled_posts');
    expect(tool.description).toContain('read_time_slots');
  });

  it('returns empty calendar when no slots exist', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, {});
    expect(result.data!.totalPosts).toBe(0);
    expect(result.data!.days).toHaveLength(0);
    expect(result.observation).toContain('No scheduled posts');
  });

  it('groups slots by day and returns correct structure', async () => {
    const slotA = {
      id: 'slot-1',
      platform: 'twitter',
      scheduledAt: new Date('2026-05-02T10:00:00Z'),
      status: 'PENDING',
      postCandidate: { content: 'Hello world post one' },
    };
    const slotB = {
      id: 'slot-2',
      platform: 'linkedin',
      scheduledAt: new Date('2026-05-02T14:00:00Z'),
      status: 'PENDING',
      postCandidate: { content: 'LinkedIn post content here' },
    };
    const slotC = {
      id: 'slot-3',
      platform: 'twitter',
      scheduledAt: new Date('2026-05-03T09:00:00Z'),
      status: 'PENDING',
      postCandidate: { content: 'Day two post' },
    };

    const ctx = makeCtx({
      db: {
        apScheduledSlot: {
          findMany: jest.fn().mockResolvedValue([slotA, slotB, slotC]),
        },
      } as any,
    });

    const result = await tool.handler(ctx, { weeks: 2 });

    expect(result.data!.totalPosts).toBe(3);
    expect(result.data!.days).toHaveLength(2);
    expect(result.data!.days[0].date).toBe('2026-05-02');
    expect(result.data!.days[0].posts).toHaveLength(2);
    expect(result.data!.days[1].date).toBe('2026-05-03');
    expect(result.data!.days[1].posts).toHaveLength(1);
    expect(result.observation).toContain('2026-05-02');
    expect(result.observation).toContain('twitter');
  });

  it('filters by platform when supplied', async () => {
    const ctx = makeCtx({
      db: {
        apScheduledSlot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any,
    });

    await tool.handler(ctx, { platform: 'linkedin', weeks: 1 });

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.where.platform).toBe('linkedin');
  });

  it('uses correct date range when weeks=1', async () => {
    const ctx = makeCtx({
      db: {
        apScheduledSlot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any,
    });

    await tool.handler(ctx, { weeks: 1 });

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    const start: Date = findCall.where.scheduledAt.gte;
    const end: Date = findCall.where.scheduledAt.lt;
    const diffMs = end.getTime() - start.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60_000);
  });

  it('respects a custom startDate input', async () => {
    const ctx = makeCtx({
      db: {
        apScheduledSlot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any,
    });

    await tool.handler(ctx, { startDate: '2026-06-01', weeks: 1 });

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    const start: Date = findCall.where.scheduledAt.gte;
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(5); // June = month index 5
    expect(start.getUTCDate()).toBe(1);
  });

  it('truncates long content snippets', async () => {
    const longContent = 'A'.repeat(200);
    const ctx = makeCtx({
      db: {
        apScheduledSlot: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'slot-x',
              platform: 'twitter',
              scheduledAt: new Date('2026-05-02T10:00:00Z'),
              status: 'PENDING',
              postCandidate: { content: longContent },
            },
          ]),
        },
      } as any,
    });

    const result = await tool.handler(ctx, {});
    const snippet = result.data!.days[0].posts[0].contentSnippet;
    expect(snippet.length).toBeLessThanOrEqual(71); // 70 chars + ellipsis
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('does not emit a structured SSE card (pure read)', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, {});
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('scopes query to the correct org', async () => {
    const ctx = makeCtx({
      db: {
        apScheduledSlot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any,
    });

    await tool.handler(ctx, {});

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.where.organizationId).toBe('org-1');
    expect(findCall.where.status).toBe('PENDING');
  });
});
