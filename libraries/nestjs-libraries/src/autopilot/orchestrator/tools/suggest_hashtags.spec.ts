import { createSuggestHashtagsTool } from './suggest_hashtags';
import type { OrchestratorContext } from '../types';

function makeCtx(llmResult: { hashtags: string[] }): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {} as any,
    llm: {
      model: {} as any,
      complete: jest.fn(),
    } as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

jest.mock('ai-v5', () => ({
  generateObject: jest.fn(),
}));

import { generateObject } from 'ai-v5';

describe('suggest_hashtags', () => {
  const tool = createSuggestHashtagsTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('suggest_hashtags');
    expect(tool.description).toContain('hashtag');
    expect(tool.description).toContain('NOT push');
  });

  it('returns hashtags from LLM', async () => {
    const tags = ['#marketing', '#growth', '#linkedin', '#b2b', '#saas'];
    (generateObject as jest.Mock).mockResolvedValue({ object: { hashtags: tags } });

    const ctx = makeCtx({ hashtags: tags });
    const result = await tool.handler(ctx, {
      content: 'A great post about B2B marketing',
      platform: 'linkedin',
    });

    expect(result.data!.hashtags).toEqual(tags);
    expect(result.observation).toContain('#marketing');
    expect(result.observation).toContain('linkedin');
  });

  it('respects count parameter', async () => {
    const tags = ['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h'];
    (generateObject as jest.Mock).mockResolvedValue({ object: { hashtags: tags } });

    const ctx = makeCtx({ hashtags: tags });
    const result = await tool.handler(ctx, {
      content: 'Some content',
      platform: 'instagram',
      count: 3,
    });

    expect(result.data!.hashtags).toHaveLength(3);
  });

  it('does not emit a structured SSE card', async () => {
    (generateObject as jest.Mock).mockResolvedValue({ object: { hashtags: ['#test'] } });

    const ctx = makeCtx({ hashtags: ['#test'] });
    await tool.handler(ctx, { content: 'x', platform: 'twitter' });

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('passes platform to LLM prompt', async () => {
    (generateObject as jest.Mock).mockResolvedValue({ object: { hashtags: ['#foo'] } });

    const ctx = makeCtx({ hashtags: ['#foo'] });
    await tool.handler(ctx, { content: 'test content', platform: 'tiktok' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.prompt).toContain('tiktok');
  });

  it('defaults count to 5 when omitted', async () => {
    const tags = ['#1', '#2', '#3', '#4', '#5'];
    (generateObject as jest.Mock).mockResolvedValue({ object: { hashtags: tags } });

    const ctx = makeCtx({ hashtags: tags });
    const result = await tool.handler(ctx, { content: 'post text', platform: 'linkedin' });

    expect(result.data!.hashtags).toHaveLength(5);
  });
});
