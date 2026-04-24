import { createClarifyWithUserTool } from './clarify_with_user';
import type { OrchestratorContext } from '../types';

function makeCtx(): {
  ctx: OrchestratorContext;
  emitted: Array<{ type: string } & Record<string, unknown>>;
} {
  const emitted: Array<{ type: string } & Record<string, unknown>> = [];
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (event) => emitted.push(event as any),
    now: new Date('2026-04-24T12:00:00Z'),
    timezone: 'UTC',
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
  return { ctx, emitted };
}

describe('clarify_with_user tool', () => {
  test('emits question as a text chunk and returns emitted=true', async () => {
    const tool = createClarifyWithUserTool();
    const { ctx, emitted } = makeCtx();

    const result = await tool.handler(ctx, {
      question: 'Which platform — twitter or linkedin?',
    });

    expect(emitted).toEqual([
      { type: 'text', chunk: 'Which platform — twitter or linkedin?' },
    ]);
    expect(result.emitted).toBe(true);
    expect(result.data).toEqual({ asked: 'Which platform — twitter or linkedin?' });
    expect(result.observation).toMatch(/asked the user/);
    expect(result.observation).toMatch(/Stop and wait/);
  });

  test('rejects empty question via schema', () => {
    const tool = createClarifyWithUserTool();
    expect(() => tool.parameters.parse({ question: '' })).toThrow();
  });

  test('exposes a stable, snake_case tool name', () => {
    const tool = createClarifyWithUserTool();
    expect(tool.name).toBe('clarify_with_user');
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
