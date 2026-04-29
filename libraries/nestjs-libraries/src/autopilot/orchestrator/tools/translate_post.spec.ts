import { createTranslatePostTool } from './translate_post';
import type { OrchestratorContext } from '../types';

function makeCtx(translateResult = 'Hola mundo'): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {} as any,
    llm: {
      model: {} as any,
      complete: jest.fn().mockResolvedValue(translateResult),
    } as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

describe('translate_post', () => {
  const tool = createTranslatePostTool();

  it('has correct name and description', () => {
    expect(tool.name).toBe('translate_post');
    expect(tool.description).toContain('translate');
    expect(tool.description).toContain('NOT push');
  });

  it('returns translated content in observation', async () => {
    const ctx = makeCtx('Bonjour le monde');
    const result = await tool.handler(ctx, {
      content: 'Hello world',
      targetLanguage: 'French',
    });

    expect(result.data!.translatedContent).toBe('Bonjour le monde');
    expect(result.observation).toContain('French');
    expect(result.observation).toContain('Bonjour le monde');
  });

  it('passes targetLanguage to LLM prompt', async () => {
    const ctx = makeCtx('translated');
    await tool.handler(ctx, {
      content: 'Hello',
      targetLanguage: 'Spanish',
    });

    const callArgs = (ctx.llm.complete as jest.Mock).mock.calls[0][0];
    expect(callArgs).toContain('Spanish');
  });

  it('includes platform hint when sourcePlatform is provided', async () => {
    const ctx = makeCtx('translated');
    await tool.handler(ctx, {
      content: 'Hello #marketing',
      targetLanguage: 'German',
      sourcePlatform: 'linkedin',
    });

    const callArgs = (ctx.llm.complete as jest.Mock).mock.calls[0][0];
    expect(callArgs).toContain('linkedin');
  });

  it('does not emit a structured SSE card', async () => {
    const ctx = makeCtx('translated text');
    await tool.handler(ctx, { content: 'x', targetLanguage: 'Italian' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('trims whitespace from LLM response', async () => {
    const ctx = makeCtx('  Ciao mondo  \n');
    const result = await tool.handler(ctx, {
      content: 'Hello world',
      targetLanguage: 'Italian',
    });
    expect(result.data!.translatedContent).toBe('Ciao mondo');
  });
});
