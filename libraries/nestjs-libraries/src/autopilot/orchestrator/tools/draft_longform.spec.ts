import { createDraftLongformTool } from './draft_longform';
import type { OrchestratorContext } from '../types';

jest.mock('ai-v5', () => ({ generateObject: jest.fn() }));
jest.mock('../../memory', () => ({ getStructuredProfile: jest.fn() }));
jest.mock('../../stack', () => ({ push: jest.fn() }));

import { generateObject } from 'ai-v5';
import { getStructuredProfile } from '../../memory';
import { push } from '../../stack';

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

describe('draft_longform', () => {
  const tool = createDraftLongformTool();
  const sampleContent = 'This is a detailed LinkedIn article about the future of AI. '.repeat(15).trim();

  beforeEach(() => {
    jest.clearAllMocks();
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { content: sampleContent } });
    (push as jest.Mock).mockResolvedValue({ id: 'cand-long-1' });
  });

  it('has correct name and description', () => {
    expect(tool.name).toBe('draft_longform');
    expect(tool.description).toContain('long-form');
  });

  it('pushes candidate and emits action_result', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { topic: 'The future of AI in marketing' });

    expect(push).toHaveBeenCalled();
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
    expect(result.data!.candidateId).toBe('cand-long-1');
  });

  it('defaults platform to linkedin', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'AI trends' });

    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'linkedin',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('uses brand voice from profile', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { brandVoiceShort: 'thought-leader', niche: 'fintech' },
      growthRules: [],
    });

    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'Fintech disruption' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('thought-leader');
  });

  it('includes optional guidelines in system prompt', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'AI', guidelines: 'focus on practical examples' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('practical examples');
  });

  it('scopes push to correct org', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'test', platform: 'facebook' });

    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'facebook',
      expect.any(String),
      expect.any(Object),
    );
  });
});
