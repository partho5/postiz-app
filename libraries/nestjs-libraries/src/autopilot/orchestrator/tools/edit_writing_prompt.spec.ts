import { createEditWritingPromptTool } from './edit_writing_prompt';
import type { OrchestratorContext } from '../types';

const EXISTING = {
  id: 'p1',
  organizationId: 'org-1',
  content: 'Old content.',
  label: 'Old label',
  ordinal: 0,
  source: 'USER',
  active: true,
};

function makeDb(existing: unknown = EXISTING) {
  return {
    apWritingPrompt: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({}),
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

describe('edit_writing_prompt', () => {
  const tool = createEditWritingPromptTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name', () => {
    expect(tool.name).toBe('edit_writing_prompt');
  });

  it('updates content when provided', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'p1', content: 'New content.' });
    expect((db as any).apWritingPrompt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'New content.' }),
      }),
    );
  });

  it('updates label when provided', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'p1', label: 'New label' });
    expect((db as any).apWritingPrompt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'New label' }),
      }),
    );
  });

  it('updates ordinal when provided', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'p1', ordinal: 5 });
    expect((db as any).apWritingPrompt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ordinal: 5 }),
      }),
    );
  });

  it('returns not-found observation for unknown promptId', async () => {
    const db = makeDb(null);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'bad-id', content: 'X' });
    expect(result.observation).toContain('not found');
    expect((db as any).apWritingPrompt.update).not.toHaveBeenCalled();
  });

  it('returns no-op observation when no fields supplied', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'p1' });
    expect(result.observation).toContain('No fields');
    expect((db as any).apWritingPrompt.update).not.toHaveBeenCalled();
  });

  it('emits action_result on success', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'p1', content: 'New.' });
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });
});
