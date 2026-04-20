/**
 * Unit tests for the Rollback post skill — slice 4.2
 *
 * All DB interactions are mocked — no real database connection required.
 */

import { ApPostCandidateStatus } from '@prisma/client';
import { handleRollback, rollbackPostSkill } from './rollback_post';
import type { RollbackPostInput } from './rollback_post';
import type { SkillContext, LlmProvider } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeLlm: LlmProvider = {
  model: {} as any,
  complete: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

/**
 * Build a mock SkillContext.  The Prisma client mock is built per-test so
 * individual tests can override specific methods.
 */
function makeCtx(dbOverrides: Partial<any> = {}): SkillContext {
  const mockTx = {
    post: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    apPostCandidate: {
      findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
      update: jest.fn().mockResolvedValue({}),
    },
    apPublishedPost: { update: jest.fn().mockResolvedValue({}) },
  };

  return {
    tenant: { id: 'org-t1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPublishedPost: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
      _mockTx: mockTx,
      ...dbOverrides,
    } as any,
    llm: fakeLlm,
    logger: mockLogger,
  };
}

const MOCK_PUBLISHED_POST = {
  id: 'pp-001',
  organizationId: 'org-t1',
  platform: 'twitter',
  postizPostId: 'piz-post-abc',
  postCandidateId: 'cand-xyz',
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rollbackPostSkill — registry shape', () => {
  it('has correct id and description', () => {
    expect(rollbackPostSkill.id).toBe('rollback_post');
    expect(typeof rollbackPostSkill.description).toBe('string');
    expect(rollbackPostSkill.description.length).toBeGreaterThan(0);
    expect(rollbackPostSkill.handler).toBe(handleRollback);
  });
});

describe('handleRollback — record not found', () => {
  it('returns rolledBack=false when ApPublishedPost does not exist', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await handleRollback(ctx, { publishedPostId: 'no-such-id' });

    expect(result.rolledBack).toBe(false);
    expect(result.publishedPostId).toBe('no-such-id');
    expect(result.note).toContain('not found');
    expect(ctx.db.$transaction).not.toHaveBeenCalled();
  });

  it('scopes the DB lookup to the calling tenant', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(null);

    await handleRollback(ctx, { publishedPostId: 'pp-001' });

    expect(ctx.db.apPublishedPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'pp-001',
          organizationId: 'org-t1',
        }),
      }),
    );
  });
});

describe('handleRollback — idempotency', () => {
  it('returns rolledBack=true without running transaction when already rolled back', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_PUBLISHED_POST,
      metadata: { rolledBack: true, rollbackReason: 'old reason' },
    });

    const result = await handleRollback(ctx, { publishedPostId: 'pp-001' });

    expect(result.rolledBack).toBe(true);
    expect(result.note).toContain('idempotent');
    expect(ctx.db.$transaction).not.toHaveBeenCalled();
  });
});

describe('handleRollback — successful rollback', () => {
  it('runs all three mutations in a transaction', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );

    const result = await handleRollback(ctx, {
      publishedPostId: 'pp-001',
      reason: 'low engagement',
    });

    expect(result.rolledBack).toBe(true);
    expect(result.platformDeleted).toBe(false);
    expect(result.postizPostId).toBe(MOCK_PUBLISHED_POST.postizPostId);
    expect(result.platform).toBe(MOCK_PUBLISHED_POST.platform);
    expect(ctx.db.$transaction).toHaveBeenCalledTimes(1);

    const tx = (ctx.db as any)._mockTx;

    // Post soft-delete
    expect(tx.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MOCK_PUBLISHED_POST.postizPostId,
          deletedAt: null,
        }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );

    // Candidate FAILED
    expect(tx.apPostCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_PUBLISHED_POST.postCandidateId },
        data: expect.objectContaining({ status: ApPostCandidateStatus.FAILED }),
      }),
    );

    // PublishedPost metadata annotation
    expect(tx.apPublishedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_PUBLISHED_POST.id },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            rolledBack: true,
            rollbackReason: 'low engagement',
          }),
        }),
      }),
    );
  });

  it('stores rollback metadata on the candidate', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );
    const tx = (ctx.db as any)._mockTx;
    tx.apPostCandidate.findUnique.mockResolvedValue({
      metadata: { existingKey: 'keep_me' },
    });

    await handleRollback(ctx, { publishedPostId: 'pp-001', reason: 'test' });

    const candidateUpdateCall = tx.apPostCandidate.update.mock.calls[0][0];
    expect(candidateUpdateCall.data.metadata).toMatchObject({
      existingKey: 'keep_me',
      rolledBack: true,
      rollbackReason: 'test',
    });
  });

  it('preserves existing metadata on the published post', async () => {
    const existingMeta = { someKey: 'someValue' };
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_PUBLISHED_POST,
      metadata: existingMeta,
    });

    await handleRollback(ctx, { publishedPostId: 'pp-001' });

    const tx = (ctx.db as any)._mockTx;
    const ppUpdateCall = tx.apPublishedPost.update.mock.calls[0][0];
    expect(ppUpdateCall.data.metadata).toMatchObject({
      someKey: 'someValue',
      rolledBack: true,
    });
  });

  it('defaults reason to "manual rollback" when omitted', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );

    await handleRollback(ctx, { publishedPostId: 'pp-001' });

    const tx = (ctx.db as any)._mockTx;
    const ppUpdateCall = tx.apPublishedPost.update.mock.calls[0][0];
    expect(ppUpdateCall.data.metadata.rollbackReason).toBe('manual rollback');
  });

  it('note explains platform content is still live', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );

    const result = await handleRollback(ctx, { publishedPostId: 'pp-001' });

    expect(result.note).toMatch(/platform/i);
    expect(result.platformDeleted).toBe(false);
  });

  it('logs an info message on success', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );

    await handleRollback(ctx, { publishedPostId: 'pp-001' });

    expect(mockLogger.info).toHaveBeenCalled();
  });
});

describe('handleRollback — transaction failure', () => {
  it('returns rolledBack=false when the transaction throws', async () => {
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );
    (ctx.db.$transaction as jest.Mock).mockRejectedValue(
      new Error('DB connection lost'),
    );

    const result = await handleRollback(ctx, { publishedPostId: 'pp-001' });

    expect(result.rolledBack).toBe(false);
    expect(result.note).toContain('DB connection lost');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('handles post.updateMany where Postiz Post is already deleted', async () => {
    // updateMany with deletedAt: null filter just returns count=0 — this is fine.
    const ctx = makeCtx();
    (ctx.db.apPublishedPost.findFirst as jest.Mock).mockResolvedValue(
      MOCK_PUBLISHED_POST,
    );

    // Override the tx mock: Post is already deleted (count = 0 but no error).
    const tx = (ctx.db as any)._mockTx;
    tx.post.updateMany.mockResolvedValue({ count: 0 });

    const result = await handleRollback(ctx, { publishedPostId: 'pp-001' });

    // Should still succeed — idempotent soft-delete.
    expect(result.rolledBack).toBe(true);
  });
});
