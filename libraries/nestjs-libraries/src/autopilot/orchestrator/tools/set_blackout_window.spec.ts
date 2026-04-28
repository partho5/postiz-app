import { createSetBlackoutWindowTool } from './set_blackout_window';
import type { OrchestratorContext } from '../types';

function makeCtx(createResult: Record<string, unknown> = {}): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apBlackoutWindow: {
        create: jest.fn().mockResolvedValue({ id: 'bw-1', timezone: 'UTC', label: null, startHour: 22, endHour: 7, ...createResult }),
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

const tool = createSetBlackoutWindowTool();

describe('set_blackout_window tool', () => {
  test('tool name is set_blackout_window', () => {
    expect(tool.name).toBe('set_blackout_window');
  });

  test('creates a blackout window row', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { startHour: 22, endHour: 7 });

    expect(ctx.db.apBlackoutWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          startHour: 22,
          endHour: 7,
          active: true,
        }),
      }),
    );
  });

  test('uses provided timezone', async () => {
    const ctx = makeCtx({ timezone: 'America/New_York' });
    await tool.handler(ctx, { startHour: 22, endHour: 6, timezone: 'America/New_York' });

    expect(ctx.db.apBlackoutWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timezone: 'America/New_York' }),
      }),
    );
  });

  test('falls back to ctx.timezone when timezone not provided', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { startHour: 0, endHour: 6 });

    expect(ctx.db.apBlackoutWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timezone: 'UTC' }),
      }),
    );
  });

  test('observation notes midnight-crossing windows', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { startHour: 22, endHour: 7 });

    expect(result.observation).toMatch(/crosses midnight/i);
  });

  test('emits action_result with ok=true', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { startHour: 12, endHour: 13, label: 'lunch' });

    expect((ctx.emit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', action: 'set_blackout_window', ok: true }),
    );
  });

  test('includes label in observation when provided', async () => {
    const ctx = makeCtx({ label: 'overnight' });
    const result = await tool.handler(ctx, { startHour: 22, endHour: 7, label: 'overnight' });

    expect(result.observation).toContain('overnight');
  });
});
