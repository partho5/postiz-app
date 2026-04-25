import { createPausePostingTool } from './pause_posting';
import type { OrchestratorContext } from '../types';

const NOW = new Date('2026-04-24T12:00:00Z');

function makeCtx(configs: Array<{ platform: string }>): {
  ctx: OrchestratorContext;
  pause: jest.Mock;
  emitted: unknown[];
} {
  const emitted: unknown[] = [];
  const pause = jest.fn().mockResolvedValue(undefined);
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apCadenceConfig: {
        findMany: jest.fn().mockResolvedValue(configs),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
  return { ctx, pause, emitted };
}

describe('pause_posting — single platform', () => {
  test('pauses specified platform for default 7 days', async () => {
    const { ctx, pause, emitted } = makeCtx([]);
    const tool = createPausePostingTool({ cadenceConfig: { pause } });

    const result = await tool.handler(ctx, { platform: 'twitter' });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledWith('org-1', 'twitter', expect.any(Date));
    const until: Date = pause.mock.calls[0][2];
    expect(until.getTime()).toBeCloseTo(
      NOW.getTime() + 7 * 24 * 60 * 60_000,
      -3,
    );
    expect(result.data?.pausedPlatforms).toEqual(['twitter']);
    expect(emitted[0]).toMatchObject({ type: 'action_result', action: 'pause_posting', ok: true });
    expect(result.emitted).toBe(true);
  });

  test('respects durationDays override', async () => {
    const { ctx, pause } = makeCtx([]);
    const tool = createPausePostingTool({ cadenceConfig: { pause } });

    await tool.handler(ctx, { platform: 'linkedin', durationDays: 3 });

    const until: Date = pause.mock.calls[0][2];
    expect(until.getTime()).toBeCloseTo(
      NOW.getTime() + 3 * 24 * 60 * 60_000,
      -3,
    );
  });

  test('parses `until` time expression', async () => {
    const { ctx, pause } = makeCtx([]);
    const tool = createPausePostingTool({ cadenceConfig: { pause } });

    await tool.handler(ctx, {
      platform: 'twitter',
      until: '2026-05-01T00:00:00Z',
    });

    const until: Date = pause.mock.calls[0][2];
    expect(until.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('pause_posting — all platforms', () => {
  test('pauses every active platform when platform omitted', async () => {
    const { ctx, pause, emitted } = makeCtx([
      { platform: 'twitter' },
      { platform: 'linkedin' },
    ]);
    const tool = createPausePostingTool({ cadenceConfig: { pause } });

    const result = await tool.handler(ctx, {});

    expect(pause).toHaveBeenCalledTimes(2);
    expect(result.data?.pausedPlatforms).toEqual(
      expect.arrayContaining(['twitter', 'linkedin']),
    );
    expect(emitted).toHaveLength(1);
  });

  test('no-op when no active configs', async () => {
    const { ctx, pause } = makeCtx([]);
    const tool = createPausePostingTool({ cadenceConfig: { pause } });

    const result = await tool.handler(ctx, {});

    expect(pause).not.toHaveBeenCalled();
    expect(result.data?.pausedPlatforms).toEqual([]);
    expect(result.observation).toMatch(/nothing to pause/i);
  });
});

describe('pause_posting — invalid `until`', () => {
  test('returns error observation for unparseable until', async () => {
    const { ctx, pause } = makeCtx([]);
    const tool = createPausePostingTool({ cadenceConfig: { pause } });

    const result = await tool.handler(ctx, {
      platform: 'twitter',
      until: 'gobbledygook time',
    });

    expect(pause).not.toHaveBeenCalled();
    expect(result.data?.pausedPlatforms).toEqual([]);
    expect(result.observation).toMatch(/clarify/i);
  });
});

describe('pause_posting — schema', () => {
  test('rejects durationDays < 1 and > 365', () => {
    const tool = createPausePostingTool({ cadenceConfig: { pause: jest.fn() } });
    expect(() => tool.parameters.parse({ durationDays: 0 })).toThrow();
    expect(() => tool.parameters.parse({ durationDays: 366 })).toThrow();
    expect(() => tool.parameters.parse({ durationDays: 7 })).not.toThrow();
  });
});
