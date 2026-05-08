import { createDeleteWritingPromptTool } from './delete_writing_prompt';
import type { OrchestratorContext } from '../types';

const EXISTING = { id: 'p1', organizationId: 'org-1', content: 'Some content.' };

function makeDb(existing: unknown = EXISTING) {
  return {
    apWritingPrompt: {
      findFirst: jest.fn().mockResolvedValue(existing),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeCtx(db: unknown = makeDb()): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: db as any,
    llm: { model: {} as any, complete: jest.fn() } as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

describe('delete_writing_prompt', () => {
  const tool = createDeleteWritingPromptTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name', () => {
    expect(tool.name).toBe('delete_writing_prompt');
  });

  it('description mentions toggle as softer alternative', () => {
    expect(tool.description.toLowerCase()).toContain('toggle');
  });

  it('hard-deletes an existing prompt', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'p1' });
    expect((db as any).apWritingPrompt.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(result.data!.deleted).toBe(true);
  });

  it('returns not-found for unknown promptId', async () => {
    const db = makeDb(null);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'bad-id' });
    expect(result.observation).toContain('not found');
    expect(result.data!.deleted).toBe(false);
    expect((db as any).apWritingPrompt.delete).not.toHaveBeenCalled();
  });

  it('emits action_result on success', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'p1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('observation confirms deletion', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'p1' });
    expect(result.observation).toContain('permanently deleted');
  });

  it('does not call delete when prompt not found', async () => {
    const db = makeDb(null);
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'missing' });
    expect((db as any).apWritingPrompt.delete).not.toHaveBeenCalled();
  });
});
