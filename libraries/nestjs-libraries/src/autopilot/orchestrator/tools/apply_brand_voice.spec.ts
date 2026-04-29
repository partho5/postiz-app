import { createApplyBrandVoiceTool } from './apply_brand_voice';
import type { OrchestratorContext } from '../types';

jest.mock('ai-v5', () => ({ generateObject: jest.fn() }));
jest.mock('../../memory', () => ({ getStructuredProfile: jest.fn() }));

import { generateObject } from 'ai-v5';
import { getStructuredProfile } from '../../memory';

function makeCtx(): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() } as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

describe('apply_brand_voice', () => {
  const tool = createApplyBrandVoiceTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('apply_brand_voice');
    expect(tool.description).toContain('brand voice');
    expect(tool.description).toContain('NOT push');
  });

  it('returns rewritten content from LLM', async () => {
    const rewritten = 'Our data-driven approach has transformed results.';
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: {
        brandVoiceShort: 'authoritative',
        brandVoiceExtended: 'We speak with authority and data.',
        antiPatterns: ['never use jargon'],
        niche: 'tech',
        goals: [],
        regulatoryFlags: [],
      },
      growthRules: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({
      object: { rewrittenContent: rewritten },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'We got good results.',
      platform: 'linkedin',
    });

    expect(result.data!.rewrittenContent).toBe(rewritten);
    expect(result.observation).toContain(rewritten);
    expect(result.observation).toContain('linkedin');
  });

  it('falls back to generic tone when no profile exists', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { rewrittenContent: 'Improved content' },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'Original content',
      platform: 'twitter',
    });

    expect(result.data!.rewrittenContent).toBe('Improved content');
    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('professional');
  });

  it('includes anti-patterns from profile in system prompt', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: {
        brandVoiceShort: 'casual',
        antiPatterns: ['never oversell', 'avoid buzzwords'],
      },
      growthRules: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({
      object: { rewrittenContent: 'Rewritten' },
    });

    const ctx = makeCtx();
    await tool.handler(ctx, { content: 'original', platform: 'instagram' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('never oversell');
  });

  it('does not emit a structured SSE card', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { rewrittenContent: 'x' },
    });

    const ctx = makeCtx();
    await tool.handler(ctx, { content: 'x', platform: 'twitter' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('includes optional guidelines in system prompt', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { rewrittenContent: 'result' },
    });

    const ctx = makeCtx();
    await tool.handler(ctx, {
      content: 'draft',
      platform: 'linkedin',
      guidelines: 'focus on ROI',
    });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('focus on ROI');
  });
});
