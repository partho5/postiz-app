import { createListPublishErrorsTool } from './list_publish_errors';
import type { OrchestratorContext } from '../types';

function makeCtx(slots: any[] = []): OrchestratorContext {
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
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

describe('list_publish_errors', () => {
  const tool = createListPublishErrorsTool();

  it('has correct name and description', () => {
    expect(tool.name).toBe('list_publish_errors');
    expect(tool.description).toContain('fail');
    expect(tool.description).toContain('list_scheduled_posts');
  });

  it('returns empty message when no errors exist', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, {});
    expect(result.data!.count).toBe(0);
    expect(result.data!.errors).toHaveLength(0);
    expect(result.observation).toContain('No publishing failures');
  });

  it('maps SKIPPED slots to errors with skipReason', async () => {
    const ctx = makeCtx([
      {
        id: 'slot-err-1',
        platform: 'twitter',
        scheduledAt: new Date('2026-04-30T09:00:00Z'),
        status: 'SKIPPED',
        metadata: { skipReason: 'no_integration' },
      },
      {
        id: 'slot-err-2',
        platform: 'linkedin',
        scheduledAt: new Date('2026-04-30T10:00:00Z'),
        status: 'SKIPPED',
        metadata: { skipReason: 'empty_stack_no_evergreen' },
      },
    ]);

    const result = await tool.handler(ctx, {});
    expect(result.data!.count).toBe(2);
    expect(result.data!.errors[0].skipReason).toBe('no_integration');
    expect(result.data!.errors[1].skipReason).toBe('empty_stack_no_evergreen');
    expect(result.observation).toContain('no_integration');
  });

  it('queries only SKIPPED status and scopes to org', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, {});

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.where.organizationId).toBe('org-1');
    expect(findCall.where.status).toBe('SKIPPED');
  });

  it('filters by platform when supplied', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, { platform: 'instagram' });

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.where.platform).toBe('instagram');
  });

  it('respects lookbackDays parameter', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, { lookbackDays: 14 });

    const findCall = (ctx.db.apScheduledSlot.findMany as jest.Mock).mock.calls[0][0];
    const since: Date = findCall.where.scheduledAt.gte;
    const diffDays = (ctx.now.getTime() - since.getTime()) / (24 * 60 * 60_000);
    expect(Math.round(diffDays)).toBe(14);
  });

  it('handles missing skipReason gracefully', async () => {
    const ctx = makeCtx([
      {
        id: 'slot-no-reason',
        platform: 'facebook',
        scheduledAt: new Date('2026-04-30T08:00:00Z'),
        status: 'SKIPPED',
        metadata: {},
      },
    ]);

    const result = await tool.handler(ctx, {});
    expect(result.data!.errors[0].skipReason).toBe('unknown');
  });

  it('does not emit a structured SSE card', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, {});
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
