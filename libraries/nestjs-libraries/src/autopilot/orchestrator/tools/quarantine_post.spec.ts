import { createQuarantinePostTool } from './quarantine_post';
import type { OrchestratorContext } from '../types';

function makeCtx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPostCandidate: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
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

const pendingCandidate = {
  id: 'cand-1',
  organizationId: 'org-1',
  platform: 'twitter',
  content: 'Some tweet content',
  status: 'PENDING',
  metadata: {},
};

describe('quarantine_post', () => {
  const tool = createQuarantinePostTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('quarantine_post');
    expect(tool.description).toContain('quarantine');
    expect(tool.description).toContain('action_result');
  });

  it('returns not-found when candidate does not exist', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await tool.handler(ctx, { candidateId: 'missing-id' });
    expect(result.observation).toContain('not found');
    expect(ctx.db.apPostCandidate.update).not.toHaveBeenCalled();
  });

  it('rejects non-PENDING candidates', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue({
      ...pendingCandidate,
      status: 'PUBLISHED',
    });

    const result = await tool.handler(ctx, { candidateId: 'cand-1' });
    expect(result.observation).toContain('PUBLISHED');
    expect(result.data!.quarantined).toBe(false);
    expect(ctx.db.apPostCandidate.update).not.toHaveBeenCalled();
  });

  it('sets status to FAILED and quarantined=true', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue(pendingCandidate);

    await tool.handler(ctx, { candidateId: 'cand-1', reason: 'off-brand messaging' });

    expect(ctx.db.apPostCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cand-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          metadata: expect.objectContaining({
            quarantined: true,
            quarantineReason: 'off-brand messaging',
          }),
        }),
      }),
    );
  });

  it('emits action_result on success', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue(pendingCandidate);

    await tool.handler(ctx, { candidateId: 'cand-1' });

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('scopes query to correct org', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue(null);

    await tool.handler(ctx, { candidateId: 'cand-1' });

    const findCall = (ctx.db.apPostCandidate.findFirst as jest.Mock).mock.calls[0][0];
    expect(findCall.where.organizationId).toBe('org-1');
  });

  it('uses manual_quarantine as default reason when none provided', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue(pendingCandidate);

    await tool.handler(ctx, { candidateId: 'cand-1' });

    const updateCall = (ctx.db.apPostCandidate.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.metadata.quarantineReason).toBe('manual_quarantine');
  });

  it('includes quarantinedAt timestamp in metadata', async () => {
    const ctx = makeCtx();
    (ctx.db.apPostCandidate.findFirst as jest.Mock).mockResolvedValue(pendingCandidate);

    await tool.handler(ctx, { candidateId: 'cand-1' });

    const updateCall = (ctx.db.apPostCandidate.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.metadata.quarantinedAt).toBe('2026-05-01T12:00:00.000Z');
  });
});
