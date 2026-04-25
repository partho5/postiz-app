import { createRollbackPublishedPostTool } from './rollback_published_post';
import type { OrchestratorContext } from '../types';

const NOW = new Date('2026-04-24T12:00:00Z');

function makeCtx(opts: {
  findFirstResult?: object | null;
  transactionError?: Error;
}): { ctx: OrchestratorContext; emitted: unknown[] } {
  const emitted: unknown[] = [];
  const mockTransaction = jest.fn(async (fn: (tx: any) => Promise<void>) => {
    if (opts.transactionError) throw opts.transactionError;
    const tx = {
      post: { updateMany: jest.fn().mockResolvedValue(undefined) },
      apPostCandidate: {
        findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      apPublishedPost: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    await fn(tx);
  });
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPublishedPost: {
        findFirst: jest.fn().mockResolvedValue(
          opts.findFirstResult !== undefined
            ? opts.findFirstResult
            : {
                id: 'pp-1',
                organizationId: 'org-1',
                platform: 'linkedin',
                postizPostId: 'pz-1',
                postCandidateId: 'pc-1',
                metadata: {},
              },
        ),
      },
      $transaction: mockTransaction,
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
  return { ctx, emitted };
}

describe('rollback_published_post — success', () => {
  test('emits action_result ok=true and returns rolledBack=true', async () => {
    const { ctx, emitted } = makeCtx({});
    const tool = createRollbackPublishedPostTool();

    const result = await tool.handler(ctx, { publishedPostId: 'pp-1' });

    expect(result.data?.rolledBack).toBe(true);
    expect(result.data?.platformDeleted).toBe(false);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: 'action_result',
      action: 'rollback_published_post',
      ok: true,
    });
    expect(result.emitted).toBe(true);
  });

  test('observation warns that platform content is still live', async () => {
    const { ctx } = makeCtx({});
    const tool = createRollbackPublishedPostTool();
    const result = await tool.handler(ctx, { publishedPostId: 'pp-1' });
    expect(result.observation.toLowerCase()).toMatch(/platform/);
    expect(result.observation.toLowerCase()).toMatch(/manually/);
  });
});

describe('rollback_published_post — not found', () => {
  test('emits action_result ok=false when record does not exist', async () => {
    const { ctx, emitted } = makeCtx({ findFirstResult: null });
    const tool = createRollbackPublishedPostTool();

    const result = await tool.handler(ctx, { publishedPostId: 'no-such' });

    expect(result.data?.rolledBack).toBe(false);
    expect(emitted[0]).toMatchObject({ ok: false });
  });
});

describe('rollback_published_post — transaction failure', () => {
  test('emits action_result ok=false on DB error', async () => {
    const { ctx, emitted } = makeCtx({
      transactionError: new Error('deadlock'),
    });
    const tool = createRollbackPublishedPostTool();

    const result = await tool.handler(ctx, { publishedPostId: 'pp-1' });

    expect(result.data?.rolledBack).toBe(false);
    expect(emitted[0]).toMatchObject({ ok: false });
    expect(result.observation).toMatch(/deadlock|failed/i);
  });
});

describe('rollback_published_post — schema', () => {
  test('requires publishedPostId', () => {
    const tool = createRollbackPublishedPostTool();
    expect(() => tool.parameters.parse({})).toThrow();
    expect(() =>
      tool.parameters.parse({ publishedPostId: 'pp-1' }),
    ).not.toThrow();
  });

  test('description mentions platform-side manual deletion', () => {
    const tool = createRollbackPublishedPostTool();
    expect(tool.description.toLowerCase()).toMatch(/platform/);
    expect(tool.description.toLowerCase()).toMatch(/manual/);
  });
});
