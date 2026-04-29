import { createRetryPublishTool } from './retry_publish';
import type { OrchestratorContext } from '../types';

function makeCtx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {
      apScheduledSlot: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-slot-1' }),
      },
    } as any,
    llm: {} as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    ...overrides,
  };
}

const skippedSlot = {
  id: 'slot-skipped-1',
  organizationId: 'org-1',
  platform: 'twitter',
  scheduledAt: new Date('2026-04-30T09:00:00Z'),
  status: 'SKIPPED',
  metadata: { skipReason: 'no_integration' },
};

describe('retry_publish', () => {
  const tool = createRetryPublishTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('retry_publish');
    expect(tool.description).toContain('retry');
    expect(tool.description).toContain('action_result');
  });

  it('returns not-found when slot does not exist', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await tool.handler(ctx, { slotId: 'bad-id' });
    expect(result.observation).toContain('not found');
    expect(ctx.db.apScheduledSlot.create).not.toHaveBeenCalled();
  });

  it('rejects non-SKIPPED slots', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue({
      ...skippedSlot,
      status: 'PENDING',
    });

    const result = await tool.handler(ctx, { slotId: 'slot-skipped-1' });
    expect(result.observation).toContain('PENDING');
    expect(ctx.db.apScheduledSlot.create).not.toHaveBeenCalled();
  });

  it('creates a new PENDING slot for the same platform', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue(skippedSlot);

    const result = await tool.handler(ctx, { slotId: 'slot-skipped-1' });

    expect(ctx.db.apScheduledSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          platform: 'twitter',
          status: 'PENDING',
          metadata: expect.objectContaining({ retriedFromSlotId: 'slot-skipped-1' }),
        }),
      }),
    );
    expect(result.data!.newSlotId).toBe('new-slot-1');
    expect(result.data!.platform).toBe('twitter');
  });

  it('defaults to now + 5 minutes when no when supplied', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue(skippedSlot);

    await tool.handler(ctx, { slotId: 'slot-skipped-1' });

    const createCall = (ctx.db.apScheduledSlot.create as jest.Mock).mock.calls[0][0];
    const scheduledAt: Date = createCall.data.scheduledAt;
    const diffMinutes = (scheduledAt.getTime() - ctx.now.getTime()) / 60_000;
    expect(Math.round(diffMinutes)).toBe(5);
  });

  it('uses parsed when time if provided', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue(skippedSlot);

    await tool.handler(ctx, { slotId: 'slot-skipped-1', when: 'in 30 minutes' });

    const createCall = (ctx.db.apScheduledSlot.create as jest.Mock).mock.calls[0][0];
    const scheduledAt: Date = createCall.data.scheduledAt;
    const diffMinutes = (scheduledAt.getTime() - ctx.now.getTime()) / 60_000;
    expect(diffMinutes).toBeGreaterThanOrEqual(25);
    expect(diffMinutes).toBeLessThanOrEqual(35);
  });

  it('emits action_result on success', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue(skippedSlot);

    await tool.handler(ctx, { slotId: 'slot-skipped-1' });

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('rejects unparseable when string', async () => {
    const ctx = makeCtx();
    (ctx.db.apScheduledSlot.findFirst as jest.Mock).mockResolvedValue(skippedSlot);

    const result = await tool.handler(ctx, { slotId: 'slot-skipped-1', when: 'gibberish time' });
    expect(result.observation).toContain('Could not parse');
    expect(ctx.db.apScheduledSlot.create).not.toHaveBeenCalled();
  });
});
