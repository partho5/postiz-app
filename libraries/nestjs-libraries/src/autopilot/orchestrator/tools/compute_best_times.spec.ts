import { createComputeBestTimesTool } from './compute_best_times';
import type { OrchestratorContext } from '../types';

function makeCtx(publishedPosts: any[] = []): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {
      apPublishedPost: {
        findMany: jest.fn().mockResolvedValue(publishedPosts),
      },
    } as any,
    llm: {} as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

describe('compute_best_times', () => {
  const tool = createComputeBestTimesTool();

  it('has correct name and description', () => {
    expect(tool.name).toBe('compute_best_times');
    expect(tool.description).toContain('best');
    expect(tool.description).toContain('read_time_slots');
    expect(tool.description).toContain('list_scheduled_posts');
  });

  it('returns no-history message when no posts exist', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, {});
    expect(result.observation).toContain('No publish history');
    expect(result.data!.platforms).toHaveLength(0);
  });

  it('returns generic tip for a specific platform with no history', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, { platform: 'linkedin' });
    expect(result.data!.platforms).toHaveLength(1);
    expect(result.data!.platforms[0].publishCount).toBe(0);
    expect(result.observation).toContain('linkedin');
    expect(result.observation).toContain('Generic advice');
  });

  it('computes top hours from publish history', async () => {
    const posts = [
      { platform: 'twitter', publishedAt: new Date('2026-04-20T09:00:00Z') },
      { platform: 'twitter', publishedAt: new Date('2026-04-21T09:00:00Z') },
      { platform: 'twitter', publishedAt: new Date('2026-04-22T09:00:00Z') },
      { platform: 'twitter', publishedAt: new Date('2026-04-23T14:00:00Z') },
      { platform: 'twitter', publishedAt: new Date('2026-04-24T14:00:00Z') },
    ];
    const ctx = makeCtx(posts);
    const result = await tool.handler(ctx, { platform: 'twitter' });

    expect(result.data!.platforms).toHaveLength(1);
    const p = result.data!.platforms[0];
    expect(p.platform).toBe('twitter');
    expect(p.publishCount).toBe(5);
    // Hour 9 appeared 3 times, hour 14 appeared 2 times
    expect(p.topHours[0]).toBe(9);
    expect(p.topHours[1]).toBe(14);
  });

  it('caps top hours at 3', async () => {
    const posts = [1, 2, 3, 4, 5, 6, 7].map((h) => ({
      platform: 'linkedin',
      publishedAt: new Date(`2026-04-20T${String(h).padStart(2, '0')}:00:00Z`),
    }));
    const ctx = makeCtx(posts);
    const result = await tool.handler(ctx, { platform: 'linkedin' });

    expect(result.data!.platforms[0].topHours.length).toBeLessThanOrEqual(3);
  });

  it('handles multiple platforms separately', async () => {
    const posts = [
      { platform: 'twitter', publishedAt: new Date('2026-04-20T09:00:00Z') },
      { platform: 'twitter', publishedAt: new Date('2026-04-21T09:00:00Z') },
      { platform: 'linkedin', publishedAt: new Date('2026-04-20T12:00:00Z') },
    ];
    const ctx = makeCtx(posts);
    const result = await tool.handler(ctx, {});

    const platforms = result.data!.platforms.map((p) => p.platform);
    expect(platforms).toContain('twitter');
    expect(platforms).toContain('linkedin');
    expect(result.data!.platforms).toHaveLength(2);
  });

  it('passes correct lookback window to query', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, { lookbackDays: 14 });

    const findCall = (ctx.db.apPublishedPost.findMany as jest.Mock).mock.calls[0][0];
    const since: Date = findCall.where.publishedAt.gte;
    const diffDays =
      (ctx.now.getTime() - since.getTime()) / (24 * 60 * 60_000);
    expect(Math.round(diffDays)).toBe(14);
  });

  it('scopes query to the correct org', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, {});

    const findCall = (ctx.db.apPublishedPost.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.where.organizationId).toBe('org-1');
  });

  it('does not emit a structured SSE card (pure read)', async () => {
    const ctx = makeCtx([]);
    await tool.handler(ctx, {});
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
