import { createListWritingPromptsTool } from './list_writing_prompts';
import type { OrchestratorContext } from '../types';

function makeDb(prompts: unknown[] = []) {
  return {
    apWritingPrompt: {
      findMany: jest.fn().mockResolvedValue(prompts),
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

const SAMPLE_PROMPT = {
  id: 'p1',
  label: 'VC voice',
  source: 'USER',
  active: true,
  ordinal: 0,
  content: 'Always open with a contrarian hook. Use first-person.',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('list_writing_prompts', () => {
  const tool = createListWritingPromptsTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name', () => {
    expect(tool.name).toBe('list_writing_prompts');
  });

  it('description distinguishes from topic suggestion', () => {
    expect(tool.description.toLowerCase()).toContain('style guide');
  });

  it('returns empty message when no prompts exist', async () => {
    const db = makeDb([]);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, {});
    expect(result.observation).toContain('No writing prompts');
    expect(result.data!.prompts).toHaveLength(0);
  });

  it('returns prompts with id, label, source, active, ordinal, snippet', async () => {
    const db = makeDb([SAMPLE_PROMPT]);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, {});
    const p = result.data!.prompts[0];
    expect(p.id).toBe('p1');
    expect(p.label).toBe('VC voice');
    expect(p.source).toBe('USER');
    expect(p.active).toBe(true);
    expect(p.ordinal).toBe(0);
    expect(p.snippet).toContain('contrarian');
  });

  it('truncates snippet to 120 chars', async () => {
    const longContent = 'A'.repeat(200);
    const db = makeDb([{ ...SAMPLE_PROMPT, content: longContent }]);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, {});
    expect(result.data!.prompts[0].snippet.length).toBeLessThanOrEqual(124); // 120 + ellipsis
    expect(result.data!.prompts[0].snippet).toContain('…');
  });

  it('lists both active and inactive prompts', async () => {
    const inactive = { ...SAMPLE_PROMPT, id: 'p2', active: false };
    const db = makeDb([SAMPLE_PROMPT, inactive]);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, {});
    expect(result.data!.prompts).toHaveLength(2);
    expect(result.data!.prompts.some((p) => !p.active)).toBe(true);
  });

  it('observation contains prompt count', async () => {
    const db = makeDb([SAMPLE_PROMPT]);
    const ctx = makeCtx(db);
    const result = await tool.handler(ctx, {});
    expect(result.observation).toContain('1');
    expect(result.observation).toContain('p1');
  });

  it('does not emit SSE event', async () => {
    const db = makeDb([SAMPLE_PROMPT]);
    const ctx = makeCtx(db);
    await tool.handler(ctx, {});
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
