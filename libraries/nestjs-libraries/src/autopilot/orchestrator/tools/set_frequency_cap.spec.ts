jest.mock('../../stack/cadence-config.service', () => ({
  applyCadenceConfig: jest.fn(),
  registerApplier: jest.fn(),
}));

import { createSetFrequencyCapTool } from './set_frequency_cap';
import { applyCadenceConfig } from '../../stack/cadence-config.service';
import type { OrchestratorContext } from '../types';

const mockApply = applyCadenceConfig as jest.MockedFunction<typeof applyCadenceConfig>;

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

const tool = createSetFrequencyCapTool();

describe('set_frequency_cap tool', () => {
  test('tool name is set_frequency_cap', () => {
    expect(tool.name).toBe('set_frequency_cap');
  });

  test('applies cap to all active platforms when none specified', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx([{ platform: 'linkedin' }, { platform: 'twitter' }]);
    const result = await tool.handler(ctx, { postsPerDay: 2 });

    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'org-1', 'linkedin', { postsPerDay: 2 });
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'org-1', 'twitter', { postsPerDay: 2 });
    expect(result.data?.appliedTo).toEqual(['linkedin', 'twitter']);
  });

  test('applies cap to specified platforms only', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { postsPerDay: 3, platforms: ['instagram'] });

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'org-1', 'instagram', { postsPerDay: 3 });
    expect(result.data?.appliedTo).toEqual(['instagram']);
  });

  test('returns "nothing to cap" when no active configs and no platforms specified', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, { postsPerDay: 2 });

    expect(mockApply).not.toHaveBeenCalled();
    expect(result.observation).toMatch(/nothing to cap/i);
  });

  test('emits action_result with ok=true', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx([{ platform: 'linkedin' }]);
    await tool.handler(ctx, { postsPerDay: 1 });

    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'set_frequency_cap', ok: true }),
    );
  });

  test('observation contains platform name and cap', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx([{ platform: 'twitter' }]);
    const result = await tool.handler(ctx, { postsPerDay: 4 });

    expect(result.observation).toContain('twitter');
    expect(result.observation).toContain('4');
  });
});
