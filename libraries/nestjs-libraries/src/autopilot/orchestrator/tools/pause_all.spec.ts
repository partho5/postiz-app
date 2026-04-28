import { createPauseAllTool } from './pause_all';
import type { OrchestratorContext } from '../types';

function makeDeps() {
  return { cadenceConfig: { pause: jest.fn().mockResolvedValue(undefined) } };
}

function makeCtx(rows: { platform: string }[] = []): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apCadenceConfig: {
        findMany: jest.fn().mockResolvedValue(rows),
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

describe('pause_all tool', () => {
  test('tool name is pause_all', () => {
    const deps = makeDeps();
    expect(createPauseAllTool(deps).name).toBe('pause_all');
  });

  test('pauses all active platforms', async () => {
    const deps = makeDeps();
    const ctx = makeCtx([{ platform: 'linkedin' }, { platform: 'twitter' }]);
    const tool = createPauseAllTool(deps);
    const result = await tool.handler(ctx, { durationDays: 7 });

    expect(deps.cadenceConfig.pause).toHaveBeenCalledTimes(2);
    expect(deps.cadenceConfig.pause).toHaveBeenCalledWith('org-1', 'linkedin', expect.any(Date));
    expect(deps.cadenceConfig.pause).toHaveBeenCalledWith('org-1', 'twitter', expect.any(Date));
    expect(result.data?.pausedPlatforms).toEqual(['linkedin', 'twitter']);
  });

  test('returns "nothing to pause" when no active configs', async () => {
    const deps = makeDeps();
    const ctx = makeCtx([]);
    const tool = createPauseAllTool(deps);
    const result = await tool.handler(ctx, {});

    expect(deps.cadenceConfig.pause).not.toHaveBeenCalled();
    expect(result.observation).toMatch(/nothing to pause/i);
  });

  test('uses durationDays to compute until', async () => {
    const deps = makeDeps();
    const ctx = makeCtx([{ platform: 'linkedin' }]);
    const tool = createPauseAllTool(deps);
    await tool.handler(ctx, { durationDays: 14 });

    const callArgs = deps.cadenceConfig.pause.mock.calls[0];
    const until = callArgs[2] as Date;
    const diffDays = (until.getTime() - ctx.now.getTime()) / (24 * 60 * 60_000);
    expect(diffDays).toBeCloseTo(14, 0);
  });

  test('defaults to 7 days when no duration given', async () => {
    const deps = makeDeps();
    const ctx = makeCtx([{ platform: 'twitter' }]);
    const tool = createPauseAllTool(deps);
    await tool.handler(ctx, {});

    const callArgs = deps.cadenceConfig.pause.mock.calls[0];
    const until = callArgs[2] as Date;
    const diffDays = (until.getTime() - ctx.now.getTime()) / (24 * 60 * 60_000);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  test('emits action_result with ok=true when paused', async () => {
    const deps = makeDeps();
    const ctx = makeCtx([{ platform: 'linkedin' }]);
    const tool = createPauseAllTool(deps);
    await tool.handler(ctx, { durationDays: 3 });

    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'pause_all', ok: true }),
    );
  });
});
