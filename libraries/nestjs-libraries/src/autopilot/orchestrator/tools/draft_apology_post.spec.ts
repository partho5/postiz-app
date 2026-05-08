import { createDraftApologyPostTool } from './draft_apology_post';
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

const DRAFT_TEXT = "We sincerely apologize for the recent outage. We're working hard to fix it.";

describe('draft_apology_post', () => {
  const tool = createDraftApologyPostTool();

  beforeEach(() => {
    jest.clearAllMocks();
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { content: DRAFT_TEXT } });
    (push as jest.Mock).mockResolvedValue({ id: 'cand-apo-1' });
  });

  it('has correct name and description', () => {
    expect(tool.name).toBe('draft_apology_post');
    expect(tool.description).toContain('apology');
    expect(tool.description).toContain('NOT for scheduling existing drafts');
  });

  it('returns drafted text in observation without pushing when pushToDraft is false', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { situation: 'server outage' });

    expect(push).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
    expect(result.emitted).toBe(false);
    expect(result.observation).toContain(DRAFT_TEXT);
    expect(result.data!.pushed).toBe(false);
  });

  it('defaults pushToDraft to false when omitted', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { situation: 'data leak' });

    expect(push).not.toHaveBeenCalled();
  });

  it('pushes candidate and emits action_result when pushToDraft is true', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { situation: 'service error', pushToDraft: true });

    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'twitter',
      DRAFT_TEXT,
      expect.objectContaining({ source: 'chat_agent', priority: 10 }),
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
    expect(result.emitted).toBe(true);
    expect(result.data!.candidateId).toBe('cand-apo-1');
    expect(result.data!.pushed).toBe(true);
  });

  it('defaults platform to twitter', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { situation: 'bug report' });

    expect(result.data!.platform).toBe('twitter');
  });

  it('uses specified platform and tone in LLM system prompt', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { situation: 'policy violation', platform: 'linkedin', tone: 'formal' });

    const call = (generateObject as jest.Mock).mock.calls[0][0];
    expect(call.system).toContain('LinkedIn');
    expect(call.system).toContain('formal');
  });

  it('injects brand voice from profile when available', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: {
        brandVoiceShort: 'transparent and direct',
        antiPatterns: ['avoid hype'],
      },
    });

    const ctx = makeCtx();
    await tool.handler(ctx, { situation: 'product recall' });

    const call = (generateObject as jest.Mock).mock.calls[0][0];
    expect(call.system).toContain('transparent and direct');
    expect(call.system).toContain('avoid hype');
  });

  it('handles profile load failure gracefully', async () => {
    (getStructuredProfile as jest.Mock).mockRejectedValue(new Error('db error'));

    const ctx = makeCtx();
    await expect(
      tool.handler(ctx, { situation: 'security incident' }),
    ).rejects.toThrow('db error');
  });
});
