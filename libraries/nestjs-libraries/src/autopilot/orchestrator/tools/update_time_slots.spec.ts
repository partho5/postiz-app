jest.mock('../../stack/cadence-config.service', () => ({
  applyCadenceConfig: jest.fn(),
  registerApplier: jest.fn(),
}));

import { createUpdateTimeSlotsTool } from './update_time_slots';
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

const tool = createUpdateTimeSlotsTool();

describe('update_time_slots tool', () => {
  test('tool name is update_time_slots', () => {
    expect(tool.name).toBe('update_time_slots');
  });

  test('calls applyCadenceConfig with normalised times', async () => {
    mockApply.mockResolvedValue(undefined);
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { platform: 'linkedin', times: ['9:00', '17:00'] });

    expect(mockApply).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'linkedin',
      expect.objectContaining({ preferredTimes: ['09:00', '17:00'] }),
    );
    expect(result.data?.preferredTimes).toEqual(['09:00', '17:00']);
  });

  test('includes timezone in applyCadenceConfig call when provided', async () => {
    mockApply.mockResolvedValue(undefined);
    await tool.handler(ctx(), {
      platform: 'twitter',
      times: ['08:00'],
      timezone: 'America/New_York',
    });

    expect(mockApply).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'twitter',
      expect.objectContaining({ timezone: 'America/New_York' }),
    );
  });

  test('does not include timezone when omitted', async () => {
    mockApply.mockResolvedValue(undefined);
    await tool.handler(ctx(), { platform: 'linkedin', times: ['10:00'] });

    const changes = (mockApply.mock.calls[0][3] as Record<string, unknown>);
    expect(changes).not.toHaveProperty('timezone');
  });

  test('emits action_result', async () => {
    mockApply.mockResolvedValue(undefined);
    const context = ctx();
    await tool.handler(context, { platform: 'linkedin', times: ['09:00'] });

    expect((context.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'update_time_slots', ok: true }),
    );
  });

  test('observation mentions platform and new times', async () => {
    mockApply.mockResolvedValue(undefined);
    const result = await tool.handler(ctx(), { platform: 'instagram', times: ['09:00', '21:00'] });

    expect(result.observation).toContain('instagram');
    expect(result.observation).toContain('09:00');
    expect(result.observation).toContain('21:00');
  });
});

function ctx() { return makeCtx(); }
