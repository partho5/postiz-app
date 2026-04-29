import { createDraftPollTool } from './draft_poll';
import type { OrchestratorContext } from '../types';

jest.mock('../../stack', () => ({
  push: jest.fn(),
}));
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

describe('draft_poll', () => {
  const tool = createDraftPollTool();

  beforeEach(() => {
    jest.clearAllMocks();
    (push as jest.Mock).mockResolvedValue({ id: 'cand-poll-1' });
  });

  it('has correct name and description', () => {
    expect(tool.name).toBe('draft_poll');
    expect(tool.description).toContain('poll');
  });

  it('pushes candidate with poll metadata', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      question: 'What is your favourite framework?',
      options: ['React', 'Vue', 'Angular'],
      platform: 'linkedin',
    });

    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'linkedin',
      expect.stringContaining('What is your favourite framework?'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          poll: { question: 'What is your favourite framework?', options: ['React', 'Vue', 'Angular'] },
        }),
      }),
    );
    expect(result.data!.candidateId).toBe('cand-poll-1');
  });

  it('emits action_result on success', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, {
      question: 'Pick one',
      options: ['A', 'B'],
      platform: 'twitter',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('rejects fewer than 2 options', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      question: 'Pick one',
      options: ['Only one'],
      platform: 'twitter',
    });
    expect(result.observation).toContain('2–4 options');
    expect(push).not.toHaveBeenCalled();
  });

  it('rejects more than 4 options', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, {
      question: 'Pick one',
      options: ['A', 'B', 'C', 'D', 'E'],
      platform: 'twitter',
    });
    expect(result.observation).toContain('2–4 options');
    expect(push).not.toHaveBeenCalled();
  });

  it('scopes push to correct org and platform', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, {
      question: 'Q?',
      options: ['Yes', 'No'],
      platform: 'instagram',
    });
    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'instagram',
      expect.any(String),
      expect.any(Object),
    );
  });
});
