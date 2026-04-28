import { createReadTimeSlotsTool } from './read_time_slots';
import type { OrchestratorContext } from '../types';

function makeCtx(
  cadenceRows: any[] = [],
): OrchestratorContext & { db: any } {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apCadenceConfig: {
        findMany: jest.fn().mockResolvedValue(cadenceRows),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-28T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'linkedin' as string,
    postsPerDay: 2 as number,
    preferredTimes: ['09:00', '17:00'] as string[],
    timezone: 'America/New_York' as string,
    pausedUntil: null as Date | null,
    active: true as boolean,
    ...overrides,
  };
}

const tool = createReadTimeSlotsTool();

describe('read_time_slots tool', () => {
  test('tool name is read_time_slots', () => {
    expect(tool.name).toBe('read_time_slots');
  });

  test('returns "no config" observation when no rows exist', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, {});

    expect(result.observation).toMatch(/no cadence configuration/i);
    expect(result.data?.configs).toHaveLength(0);
    expect(result.emitted).toBeFalsy();
  });

  test('returns platform-specific "no config" when platform filter matches nothing', async () => {
    const ctx = makeCtx([]);
    const result = await tool.handler(ctx, { platform: 'twitter' });

    expect(result.observation).toMatch(/twitter/i);
    expect(result.data?.configs).toHaveLength(0);
  });

  test('formats active config with times and postsPerDay', async () => {
    const ctx = makeCtx([makeRow()]);
    const result = await tool.handler(ctx, {});

    expect(result.observation).toContain('linkedin');
    expect(result.observation).toContain('09:00');
    expect(result.observation).toContain('17:00');
    expect(result.observation).toContain('2 post(s)/day');
    expect(result.observation).toContain('America/New_York');
    expect(result.observation).toContain('active');
  });

  test('marks config as paused when pausedUntil is in the future', async () => {
    const future = new Date('2099-01-01T00:00:00Z');
    const ctx = makeCtx([makeRow({ pausedUntil: future })]);
    const result = await tool.handler(ctx, {});

    expect(result.observation).toContain('paused');
    expect(result.data?.configs[0].paused).toBe(true);
    expect(result.data?.configs[0].pausedUntil).toBe(future.toISOString());
  });

  test('treats past pausedUntil as active (auto-resumed)', async () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const ctx = makeCtx([makeRow({ pausedUntil: past })]);
    const result = await tool.handler(ctx, {});

    expect(result.data?.configs[0].paused).toBe(false);
    expect(result.observation).toContain('active');
  });

  test('shows "(no preferred times set)" when preferredTimes is empty', async () => {
    const ctx = makeCtx([makeRow({ preferredTimes: [] })]);
    const result = await tool.handler(ctx, {});

    expect(result.observation).toContain('no preferred times set');
  });

  test('returns configs for multiple platforms', async () => {
    const ctx = makeCtx([
      makeRow({ platform: 'linkedin' }),
      makeRow({ platform: 'twitter', postsPerDay: 5, preferredTimes: ['08:00'] }),
    ]);
    const result = await tool.handler(ctx, {});

    expect(result.data?.configs).toHaveLength(2);
    expect(result.observation).toContain('2 platform(s)');
  });

  test('does not emit a UI card (no emitted flag)', async () => {
    const ctx = makeCtx([makeRow()]);
    const result = await tool.handler(ctx, {});

    expect(result.emitted).toBeFalsy();
    expect((ctx.emit as jest.Mock).mock.calls).toHaveLength(0);
  });

  test('passes platform filter to DB query', async () => {
    const ctx = makeCtx([makeRow({ platform: 'twitter' })]);
    const result = await tool.handler(ctx, { platform: 'twitter' });

    expect(ctx.db.apCadenceConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ platform: 'twitter' }),
      }),
    );
    expect(result.data?.configs[0].platform).toBe('twitter');
  });
});
