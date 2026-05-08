import { createToggleWritingPromptTool } from './toggle_writing_prompt';
import type { OrchestratorContext } from '../types';

const EXISTING = { id: 'p1', organizationId: 'org-1', active: true };

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

describe('toggle_writing_prompt', () => {
  const tool = createToggleWritingPromptTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name', () => {
    expect(tool.name).toBe('toggle_writing_prompt');
  });

  it('description distinguishes from delete', () => {
    expect(tool.description.toLowerCase()).toContain('delete');
  });

  it('deactivates an active prompt', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'p1', active: false });
    expect((db as any).apWritingPrompt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(result.data!.active).toBe(false);
  });

  it('activates an inactive prompt', async () => {
    const db = makeDb({ ...EXISTING, active: false });
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'p1', active: true });
    expect((db as any).apWritingPrompt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: true } }),
    );
    expect(result.data!.active).toBe(true);
  });

  it('returns not-found for unknown promptId', async () => {
    const db = makeDb(null);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'bad-id', active: false });
    expect(result.observation).toContain('not found');
    expect((db as any).apWritingPrompt.update).not.toHaveBeenCalled();
  });

  it('emits action_result on success', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'p1', active: false });
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('observation states whether prompt is now active or inactive', async () => {
    const db = makeDb();
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, { promptId: 'p1', active: false });
    expect(result.observation).toContain('deactivated');
  });

  it('does not update when prompt not found', async () => {
    const db = makeDb(null);
    const ctx = makeCtx(db);
    await tool.handler(ctx, { promptId: 'missing', active: true });
    expect((db as any).apWritingPrompt.update).not.toHaveBeenCalled();
  });
});
