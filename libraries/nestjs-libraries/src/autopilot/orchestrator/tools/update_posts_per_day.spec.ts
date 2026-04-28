jest.mock('../../stack/cadence-config.service', () => ({
  applyCadenceConfig: jest.fn(),
  registerApplier: jest.fn(),
}));

import { createUpdatePostsPerDayTool } from './update_posts_per_day';
import { applyCadenceConfig } from '../../stack/cadence-config.service';
import type { OrchestratorContext } from '../types';

const mockApply = applyCadenceConfig as jest.MockedFunction<typeof applyCadenceConfig>;

function makeCtx(): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-28T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

beforeEach(() => jest.clearAllMocks());

const tool = createUpdatePostsPerDayTool();

describe('update_posts_per_day tool', () => {
  test('tool name is update_posts_per_day', () => {
    expect(tool.name).toBe('update_posts_per_day');
  });

  test('calls applyCadenceConfig with postsPerDay', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx();
    await tool.handler(ctx, { platform: 'linkedin', postsPerDay: 3 });

    expect(mockApply).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'linkedin',
      { postsPerDay: 3 },
    );
  });

  test('returns correct output data', async () => {
    mockApply.mockResolvedValue(undefined);
    const result = await tool.handler(makeCtx(), { platform: 'twitter', postsPerDay: 5 });

    expect(result.data).toEqual({ platform: 'twitter', postsPerDay: 5 });
  });

  test('emits action_result with ok=true', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx();
    await tool.handler(ctx, { platform: 'twitter', postsPerDay: 2 });

    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  test('observation mentions platform and count', async () => {
    mockApply.mockResolvedValue(undefined);
    const result = await tool.handler(makeCtx(), { platform: 'instagram', postsPerDay: 4 });

    expect(result.observation).toContain('instagram');
    expect(result.observation).toContain('4');
  });

  test('emitted flag is set', async () => {
    mockApply.mockResolvedValue(undefined);
    const result = await tool.handler(makeCtx(), { platform: 'linkedin', postsPerDay: 1 });
    expect(result.emitted).toBe(true);
  });
});
