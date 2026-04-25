import { createResumePostingTool } from './resume_posting';
import type { OrchestratorContext } from '../types';

const NOW = new Date('2026-04-24T12:00:00Z');

function makeCtx(pausedConfigs: Array<{ platform: string }>): {
  ctx: OrchestratorContext;
  resume: jest.Mock;
  emitted: unknown[];
} {
  const emitted: unknown[] = [];
  const resume = jest.fn().mockResolvedValue(undefined);
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apCadenceConfig: {
        findMany: jest.fn().mockResolvedValue(pausedConfigs),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
  return { ctx, resume, emitted };
}

describe('resume_posting — single platform', () => {
  test('resumes specified platform directly', async () => {
    const { ctx, resume, emitted } = makeCtx([]);
    const tool = createResumePostingTool({ cadenceConfig: { resume } });

    const result = await tool.handler(ctx, { platform: 'twitter' });

    expect(resume).toHaveBeenCalledWith('org-1', 'twitter');
    expect(result.data?.resumedPlatforms).toEqual(['twitter']);
    expect(emitted[0]).toMatchObject({
      type: 'action_result',
      action: 'resume_posting',
      ok: true,
    });
    expect(result.emitted).toBe(true);
  });
});

describe('resume_posting — all paused platforms', () => {
  test('resumes all paused platforms when platform omitted', async () => {
    const { ctx, resume, emitted } = makeCtx([
      { platform: 'twitter' },
      { platform: 'linkedin' },
    ]);
    const tool = createResumePostingTool({ cadenceConfig: { resume } });

    const result = await tool.handler(ctx, {});

    expect(resume).toHaveBeenCalledTimes(2);
    expect(result.data?.resumedPlatforms).toEqual(
      expect.arrayContaining(['twitter', 'linkedin']),
    );
    expect(emitted).toHaveLength(1);
  });

  test('no-op when nothing is paused', async () => {
    const { ctx, resume, emitted } = makeCtx([]);
    const tool = createResumePostingTool({ cadenceConfig: { resume } });

    const result = await tool.handler(ctx, {});

    expect(resume).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
    expect(result.observation).toMatch(/nothing to resume/i);
  });
});

describe('resume_posting — description', () => {
  test('description mentions paused platforms and omitting platform', () => {
    const tool = createResumePostingTool({ cadenceConfig: { resume: jest.fn() } });
    expect(tool.description.toLowerCase()).toMatch(/paused/);
    expect(tool.description.toLowerCase()).toMatch(/platform/);
  });
});
