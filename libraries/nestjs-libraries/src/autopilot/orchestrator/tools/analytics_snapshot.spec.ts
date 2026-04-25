jest.mock('../../skills/analytics_snapshot', () => ({
  handleAnalyticsSnapshot: jest.fn(),
}));

import { createAnalyticsSnapshotTool } from './analytics_snapshot';
import { handleAnalyticsSnapshot } from '../../skills/analytics_snapshot';
import type { OrchestratorContext } from '../types';
import type { AnalyticsSnapshotOutput } from '../../skills/analytics_snapshot';

const mockHandleAnalytics = handleAnalyticsSnapshot as jest.MockedFunction<
  typeof handleAnalyticsSnapshot
>;

const NOW = new Date('2026-04-24T12:00:00Z');

function makeCtx(): { ctx: OrchestratorContext; emitted: unknown[] } {
  const emitted: unknown[] = [];
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
  return { ctx, emitted };
}

function makeSkillResult(
  overrides: Partial<AnalyticsSnapshotOutput> = {},
): AnalyticsSnapshotOutput {
  return {
    platform: 'linkedin',
    integrationId: 'int-1',
    integrationName: 'My LinkedIn',
    data: [
      { label: 'Impressions', data: [{ total: '1000', date: '2026-04-01' }, { total: '1200', date: '2026-04-02' }], percentageChange: 20 },
      { label: 'Likes', data: [{ total: '50', date: '2026-04-01' }, { total: '60', date: '2026-04-02' }], percentageChange: -5 },
    ],
    capturedAt: NOW.toISOString(),
    periodDays: 30,
    supported: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('analytics_snapshot — supported with data', () => {
  test('emits analytics_card with aggregated metrics and trend', async () => {
    const { ctx, emitted } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(makeSkillResult());
    const tool = createAnalyticsSnapshotTool();

    const result = await tool.handler(ctx, { platform: 'linkedin' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: 'analytics_card',
      platform: 'linkedin',
      periodDays: 30,
    });
    const card = emitted[0] as any;
    expect(card.metrics).toHaveLength(2);
    expect(card.metrics[0]).toMatchObject({ label: 'Impressions', value: 2200, trend: 'up' });
    expect(card.metrics[1]).toMatchObject({ label: 'Likes', value: 110, trend: 'down' });
    expect(result.emitted).toBe(true);
  });

  test('observation contains platform name and metric summary', async () => {
    const { ctx } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(makeSkillResult());
    const tool = createAnalyticsSnapshotTool();

    const result = await tool.handler(ctx, { platform: 'linkedin' });

    expect(result.observation).toMatch(/Impressions/);
    expect(result.observation).toMatch(/Likes/);
    expect(result.observation).toMatch(/30d/);
  });

  test('data payload reflects skill result', async () => {
    const { ctx } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(makeSkillResult());
    const tool = createAnalyticsSnapshotTool();

    const result = await tool.handler(ctx, { platform: 'linkedin' });

    expect(result.data?.platform).toBe('linkedin');
    expect(result.data?.supported).toBe(true);
    expect(result.data?.dataPoints).toBe(2);
  });

  test('passes integrationId and periodDays to skill', async () => {
    const { ctx } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(makeSkillResult({ periodDays: 7 }));
    const tool = createAnalyticsSnapshotTool();

    await tool.handler(ctx, {
      platform: 'linkedin',
      integrationId: 'int-42',
      periodDays: 7,
    });

    expect(mockHandleAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: expect.objectContaining({ id: 'org-1' }) }),
      { platform: 'linkedin', integrationId: 'int-42', periodDays: 7 },
    );
  });
});

describe('analytics_snapshot — not supported', () => {
  test('does not emit analytics_card when supported=false', async () => {
    const { ctx, emitted } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(
      makeSkillResult({ supported: false, data: [], note: 'Provider has no analytics()' }),
    );
    const tool = createAnalyticsSnapshotTool();

    const result = await tool.handler(ctx, { platform: 'linkedin' });

    expect(emitted).toHaveLength(0);
    expect(result.emitted).toBeFalsy();
    expect(result.observation).toMatch(/not connected|not supported|No analytics/i);
    expect(result.data?.supported).toBe(false);
  });

  test('observation mentions the note when not supported', async () => {
    const { ctx } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(
      makeSkillResult({ supported: false, data: [], note: 'No active integration found for platform "tiktok"' }),
    );
    const tool = createAnalyticsSnapshotTool();

    const result = await tool.handler(ctx, { platform: 'tiktok' });

    expect(result.observation).toMatch(/No active integration/);
  });
});

describe('analytics_snapshot — supported but empty data', () => {
  test('does not emit card when data is empty', async () => {
    const { ctx, emitted } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(
      makeSkillResult({ supported: true, data: [] }),
    );
    const tool = createAnalyticsSnapshotTool();

    const result = await tool.handler(ctx, { platform: 'linkedin' });

    expect(emitted).toHaveLength(0);
    expect(result.emitted).toBeFalsy();
    expect(result.data?.dataPoints).toBe(0);
    expect(result.observation).toMatch(/no analytics data/i);
  });
});

describe('analytics_snapshot — flat trend', () => {
  test('trend=flat when percentageChange is 0', async () => {
    const { ctx, emitted } = makeCtx();
    mockHandleAnalytics.mockResolvedValue(
      makeSkillResult({
        data: [{ label: 'Views', data: [{ total: '500', date: '2026-04-01' }], percentageChange: 0 }],
      }),
    );
    const tool = createAnalyticsSnapshotTool();

    await tool.handler(ctx, { platform: 'linkedin' });

    const card = emitted[0] as any;
    expect(card.metrics[0].trend).toBe('flat');
  });
});

describe('analytics_snapshot — schema', () => {
  test('requires platform', () => {
    const tool = createAnalyticsSnapshotTool();
    expect(() => tool.parameters.parse({})).toThrow();
    expect(() => tool.parameters.parse({ platform: 'twitter' })).not.toThrow();
  });

  test('rejects periodDays out of range', () => {
    const tool = createAnalyticsSnapshotTool();
    expect(() => tool.parameters.parse({ platform: 'twitter', periodDays: 0 })).toThrow();
    expect(() => tool.parameters.parse({ platform: 'twitter', periodDays: 366 })).toThrow();
    expect(() => tool.parameters.parse({ platform: 'twitter', periodDays: 30 })).not.toThrow();
  });

  test('description mentions analytics and social account', () => {
    const tool = createAnalyticsSnapshotTool();
    expect(tool.description.toLowerCase()).toMatch(/analytics/);
    expect(tool.description.toLowerCase()).toMatch(/social/);
  });
});
