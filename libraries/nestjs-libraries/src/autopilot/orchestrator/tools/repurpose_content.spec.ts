import { createRepurposeContentTool } from './repurpose_content';
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

describe('repurpose_content', () => {
  const tool = createRepurposeContentTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('repurpose_content');
    expect(tool.description).toContain('repurpose');
  });

  it('returns repurposed variants without pushing when pushToDraft is false', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        variants: [
          { format: 'thread', content: 'Tweet 1\n---\nTweet 2\n---\nTweet 3' },
          { format: 'short', content: 'Short version of the post.' },
        ],
      },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'Original long-form content about marketing strategies.',
      targetFormats: ['thread', 'short'],
      pushToDraft: false,
    });

    expect(result.data!.variants).toHaveLength(2);
    expect(result.data!.pushedCount).toBe(0);
    expect(push).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('pushes drafts and emits action_result when pushToDraft is true', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (push as jest.Mock).mockResolvedValue({});
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        variants: [
          { format: 'short', content: 'Short version.' },
        ],
      },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'Original content.',
      targetFormats: ['short'],
      platform: 'twitter',
      pushToDraft: true,
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'twitter',
      'Short version.',
      expect.objectContaining({ metadata: expect.objectContaining({ format: 'short' }) }),
    );
    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'action_result', ok: true }));
    expect(result.data!.pushedCount).toBe(1);
    expect(result.emitted).toBe(true);
  });

  it('pushes multiple variants when multiple formats requested', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (push as jest.Mock).mockResolvedValue({});
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        variants: [
          { format: 'thread', content: 'Thread content.' },
          { format: 'carousel', content: 'Carousel content.' },
          { format: 'longform', content: 'Longform content.' },
        ],
      },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'Original post.',
      targetFormats: ['thread', 'carousel', 'longform'],
      pushToDraft: true,
    });

    expect(push).toHaveBeenCalledTimes(3);
    expect(result.data!.pushedCount).toBe(3);
  });

  it('uses brand voice from profile in system prompt', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { brandVoiceShort: 'witty and casual', niche: 'SaaS', goals: [] },
      growthRules: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({
      object: { variants: [{ format: 'short', content: 'Witty short post.' }] },
    });

    const ctx = makeCtx();
    await tool.handler(ctx, { content: 'Original.', targetFormats: ['short'] });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('witty and casual');
  });

  it('includes format descriptions in the prompt', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { variants: [{ format: 'thread', content: 'Thread.' }] },
    });

    const ctx = makeCtx();
    await tool.handler(ctx, { content: 'Original.', targetFormats: ['thread'] });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.prompt).toContain('thread');
    expect(callArgs.prompt).toContain('Original.');
  });

  it('does not emit when pushToDraft is false', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { variants: [{ format: 'short', content: 'Short.' }] },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'Content.',
      targetFormats: ['short'],
      pushToDraft: false,
    });

    expect(ctx.emit).not.toHaveBeenCalled();
    expect(result.emitted).toBeFalsy();
  });

  it('includes original content length in output', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { variants: [{ format: 'short', content: 'Short.' }] },
    });

    const ctx = makeCtx();
    const original = 'This is the original post content with known length.';
    const result = await tool.handler(ctx, { content: original, targetFormats: ['short'] });

    expect(result.data!.originalLength).toBe(original.length);
  });

  it('formats observation with variant sections', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        variants: [
          { format: 'short', content: 'Short post content.' },
          { format: 'thread', content: 'Thread part 1\n---\nThread part 2' },
        ],
      },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      content: 'Original.',
      targetFormats: ['short', 'thread'],
    });

    expect(result.observation).toContain('SHORT');
    expect(result.observation).toContain('THREAD');
    expect(result.observation).toContain('Short post content.');
  });
});
