import { createDraftCarouselTool } from './draft_carousel';
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

const mockSlides = [
  { title: 'Slide 1: Hook', text: 'Did you know that...' },
  { title: 'Slide 2: Problem', text: 'The problem is...' },
  { title: 'Slide 3: Solution', text: 'Here is the fix...' },
  { title: 'Slide 4: Example', text: 'For example...' },
  { title: 'Slide 5: CTA', text: 'Try it today!' },
];

describe('draft_carousel', () => {
  const tool = createDraftCarouselTool();

  beforeEach(() => {
    jest.clearAllMocks();
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { caption: 'Main caption for carousel', slides: mockSlides },
    });
    (push as jest.Mock).mockResolvedValue({ id: 'cand-car-1' });
  });

  it('has correct name and description', () => {
    expect(tool.name).toBe('draft_carousel');
    expect(tool.description).toContain('carousel');
  });

  it('pushes candidate with slides in contentVariants', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: '5 productivity tips' });

    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'instagram',
      'Main caption for carousel',
      expect.objectContaining({
        contentVariants: expect.objectContaining({ slides: expect.any(Array) }),
      }),
    );
  });

  it('emits action_result on success', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'productivity' });

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('defaults platform to instagram and slideCount to 5', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { topic: 'tips' });

    expect(result.data!.platform).toBe('instagram');
    expect(result.data!.slideCount).toBe(5);
  });

  it('clamps slides to requested slideCount', async () => {
    // LLM returns 5 slides but user requested 3
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { topic: 'tips', slideCount: 3 });

    expect(result.data!.slideCount).toBe(3);
    const pushCall = (push as jest.Mock).mock.calls[0];
    expect(pushCall[4].contentVariants.slides).toHaveLength(3);
  });

  it('uses brand voice from profile when available', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { brandVoiceShort: 'energetic' },
      growthRules: [],
    });
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'fitness tips', platform: 'instagram' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('energetic');
  });

  it('scopes push to correct org and platform', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'tips', platform: 'linkedin' });

    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'linkedin',
      expect.any(String),
      expect.any(Object),
    );
  });
});
