/**
 * Orchestrator agent unit tests — slice 1.3.c
 *
 * `generateText` from ai-v5 is mocked so we can drive the loop
 * deterministically: the mock simulates the LLM choosing a tool, we
 * invoke that tool's `execute`, then the mock returns the final text.
 *
 * The Prisma surface is also mocked — only the calls `buildStateSnapshot`
 * makes are exercised here.
 */

jest.mock('ai-v5', () => ({
  ...jest.requireActual('ai-v5'),
  generateText: jest.fn(),
}));

// The analytics_snapshot skill transitively imports socialIntegrationList which
// pulls in social.abstract.ts → concurrency.service.ts (a file with a TS error
// under noImplicitReturns). Mock the skill to break that import chain so
// ts-jest can compile this spec without touching the integration stack.
jest.mock('../skills/analytics_snapshot', () => ({
  handleAnalyticsSnapshot: jest.fn(),
}));

import { generateText } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import {
  runOrchestrator,
  buildSystemPrompt,
  adaptToolsForAiSdk,
  ORCHESTRATOR_MAX_STEPS,
  type OrchestratorRunDependencies,
} from './orchestrator';
import type {
  OrchestratorContext,
  OrchestratorTool,
  OrchestratorToolResult,
} from '../orchestrator';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

const NOW = new Date('2026-04-23T20:00:00Z');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: {
  pendingAction?: { collectedData?: unknown; expiresAt?: Date } | null;
  startFlowEmits?: Array<{ type: string } & Record<string, unknown>>;
  cancelAction?: jest.Mock;
} = {}): {
  deps: OrchestratorRunDependencies;
  emitted: any[];
  startFlow: jest.Mock;
} {
  const emitted: any[] = [];
  const startFlow = jest.fn(async (_org, _user, _data, _llm, emit) => {
    for (const e of overrides.startFlowEmits ?? []) emit(e);
    return '';
  });
  const cancelAction = overrides.cancelAction ?? jest.fn().mockResolvedValue(undefined);

  const pending = overrides.pendingAction
    ? {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: overrides.pendingAction.collectedData ?? {},
        expiresAt:
          overrides.pendingAction.expiresAt ??
          new Date(NOW.getTime() + 30 * 60_000),
      }
    : null;

  const deps: OrchestratorRunDependencies = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      integration: { findMany: jest.fn().mockResolvedValue([]) },
      apCadenceConfig: { findMany: jest.fn().mockResolvedValue([]) },
      apPendingAction: { findUnique: jest.fn().mockResolvedValue(pending) },
      apScheduledSlot: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any,
    llm: { model: {} as LanguageModel, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: 'UTC',
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    directAction: {
      startFlow,
      cancelAction,
    } as any,
    cadenceConfig: {
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
    } as any,
  };

  return { deps, emitted, startFlow };
}

beforeEach(() => {
  mockGenerateText.mockReset();
});

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  test('embeds state inside <state> fence and includes the pending-action rule', () => {
    const out = buildSystemPrompt('now: 2026-04-23T20:00:00Z\npending_action: none');
    expect(out).toMatch(/<state>[\s\S]*now: 2026-04-23T20:00:00Z[\s\S]*<\/state>/);
    expect(out).toMatch(/multi-turn post-creation flow is already pending/);
    expect(out).toMatch(/do not call schedule_post and clarify_with_user/i);
  });

  test('forbids pre-converting time expressions', () => {
    const out = buildSystemPrompt('');
    expect(out).toMatch(/do NOT pre-convert.*ISO/i);
  });
});

// ---------------------------------------------------------------------------
// adaptToolsForAiSdk
// ---------------------------------------------------------------------------

describe('adaptToolsForAiSdk', () => {
  test('exposes one record entry per registry tool, keyed by name', () => {
    const ctx = {} as OrchestratorContext;
    const trace: { name: string; result: OrchestratorToolResult<unknown> }[] = [];
    const tools = [
      makeStubTool('alpha', 'A description'),
      makeStubTool('beta', 'B description'),
    ];
    const adapted = adaptToolsForAiSdk(ctx, tools, trace);
    expect(Object.keys(adapted).sort()).toEqual(['alpha', 'beta']);
    expect((adapted.alpha as any).description).toBe('A description');
  });

  test('execute calls handler and pushes to trace', async () => {
    const ctx = {} as OrchestratorContext;
    const trace: { name: string; result: OrchestratorToolResult<unknown> }[] = [];
    const handler = jest.fn().mockResolvedValue({
      observation: 'did the thing',
      data: { x: 1 },
    });
    const tools = [
      {
        name: 'do_thing',
        description: 'd',
        parameters: { parse: (x: unknown) => x } as any,
        handler,
      } as OrchestratorTool<unknown, unknown>,
    ];
    const adapted = adaptToolsForAiSdk(ctx, tools, trace);

    const observation = await (adapted.do_thing as any).execute(
      { y: 2 },
      { toolCallId: 't1', messages: [] },
    );

    expect(handler).toHaveBeenCalledWith(ctx, { y: 2 });
    expect(observation).toBe('did the thing');
    expect(trace).toEqual([
      {
        name: 'do_thing',
        result: { observation: 'did the thing', data: { x: 1 } },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// runOrchestrator
// ---------------------------------------------------------------------------

describe('runOrchestrator — text-only response', () => {
  test('emits final text when no tool was called', async () => {
    const { deps, emitted } = makeDeps();

    mockGenerateText.mockResolvedValue({
      text: 'Just chatting back.',
    } as any);

    const out = await runOrchestrator(deps, {
      message: 'hello',
      history: [],
    });

    expect(out.text).toBe('Just chatting back.');
    expect(out.toolCallCount).toBe(0);
    expect(out.toolsUsed).toEqual([]);
    expect(emitted).toEqual([{ type: 'text', chunk: 'Just chatting back.' }]);
  });

  test('passes history + current message to generateText', async () => {
    const { deps } = makeDeps();
    mockGenerateText.mockResolvedValue({ text: 'ok' } as any);

    await runOrchestrator(deps, {
      message: 'after 5 minutes',
      history: [
        { role: 'user', content: 'schedule a post about cats' },
        { role: 'assistant', content: 'Post now or schedule it?' },
      ],
    });

    const args = mockGenerateText.mock.calls[0][0] as any;
    expect(args.messages).toEqual([
      { role: 'user', content: 'schedule a post about cats' },
      { role: 'assistant', content: 'Post now or schedule it?' },
      { role: 'user', content: 'after 5 minutes' },
    ]);
  });

  test('passes the model from llm.model and caps steps at ORCHESTRATOR_MAX_STEPS', async () => {
    const { deps } = makeDeps();
    mockGenerateText.mockResolvedValue({ text: '' } as any);

    await runOrchestrator(deps, { message: 'hi', history: [] });

    const args = mockGenerateText.mock.calls[0][0] as any;
    expect(args.model).toBe(deps.llm.model);
    expect(args.stopWhen).toBeDefined();
    // We can't introspect the StopCondition cleanly; just assert it's set.
    expect(ORCHESTRATOR_MAX_STEPS).toBe(8);
  });
});

describe('runOrchestrator — tool dispatch', () => {
  test('drives schedule_post → suppresses final text echo when tool emitted', async () => {
    const { deps, emitted } = makeDeps({
      pendingAction: {
        collectedData: { topics: ['launch'], platforms: ['twitter'] },
      },
      startFlowEmits: [
        {
          type: 'draft_preview',
          pendingActionId: 'pa-1',
          posts: [{ topic: 'launch', platform: 'twitter', content: 'Launch!', scheduledAt: '2026-04-23T20:05:00.000Z' }],
        },
      ],
    });

    mockGenerateText.mockImplementation(async (args: any) => {
      // Simulate the model picking schedule_post with the parsed phrase.
      const observation = await args.tools.schedule_post.execute(
        { topics: ['launch'], startTime: 'after 5 minutes' },
        { toolCallId: 't1', messages: [] },
      );
      // After seeing the observation, the model produces a stub text reply
      // — which the orchestrator MUST suppress because the tool already
      // pushed a draft_preview event.
      expect(observation).toMatch(/draft preview/i);
      return { text: 'I scheduled the post.' } as any;
    });

    const out = await runOrchestrator(deps, {
      message: 'after 5 minutes',
      history: [],
    });

    expect(out.text).toBe('');
    expect(out.toolsUsed).toEqual(['schedule_post']);
    // Only the draft_preview should have been emitted; no echoed text.
    const types = emitted.map((e) => e.type);
    expect(types).toContain('draft_preview');
    expect(types).not.toContain('text');
  });

  test('drives clarify_with_user → emits the question once', async () => {
    const { deps, emitted } = makeDeps();

    mockGenerateText.mockImplementation(async (args: any) => {
      await args.tools.clarify_with_user.execute(
        { question: 'Which platform — twitter or linkedin?' },
        { toolCallId: 't1', messages: [] },
      );
      return { text: '' } as any;
    });

    const out = await runOrchestrator(deps, {
      message: 'schedule a post',
      history: [],
    });

    expect(out.toolsUsed).toEqual(['clarify_with_user']);
    expect(emitted).toEqual([
      { type: 'text', chunk: 'Which platform — twitter or linkedin?' },
    ]);
  });

  test('drives cancel_pending_draft when user said never mind', async () => {
    const cancelAction = jest.fn().mockResolvedValue(undefined);
    const { deps } = makeDeps({
      pendingAction: { collectedData: { topic: 'x' } },
      cancelAction,
    });

    mockGenerateText.mockImplementation(async (args: any) => {
      await args.tools.cancel_pending_draft.execute(
        { reason: 'user said never mind' },
        { toolCallId: 't1', messages: [] },
      );
      return { text: 'Cancelled.' } as any;
    });

    const out = await runOrchestrator(deps, {
      message: 'never mind',
      history: [],
    });

    expect(out.toolsUsed).toEqual(['cancel_pending_draft']);
    expect(cancelAction).toHaveBeenCalledWith('org-1');
    // text=Cancelled is non-empty AND the cancel tool did not mark emitted=true,
    // so the orchestrator's final text should be sent.
    expect(out.text).toBe('Cancelled.');
  });

  test('multi-tool chain: cancel_pending_draft then schedule_post', async () => {
    const cancelAction = jest.fn().mockResolvedValue(undefined);
    const { deps, emitted } = makeDeps({
      pendingAction: { collectedData: { topic: 'old' } },
      cancelAction,
      startFlowEmits: [
        {
          type: 'draft_preview',
          pendingActionId: 'pa-2',
          posts: [{ topic: 'new feature', platform: 'twitter', content: 'New', scheduledAt: '2026-04-23T20:10:00.000Z' }],
        },
      ],
    });

    mockGenerateText.mockImplementation(async (args: any) => {
      await args.tools.cancel_pending_draft.execute(
        { reason: 'starting fresh' },
        { toolCallId: 't1', messages: [] },
      );
      await args.tools.schedule_post.execute(
        { topics: ['new feature'], startTime: 'in 10 minutes' },
        { toolCallId: 't2', messages: [] },
      );
      return { text: '' } as any;
    });

    const out = await runOrchestrator(deps, {
      message: 'forget that — post about the new feature in 10 minutes',
      history: [],
    });

    expect(out.toolsUsed).toEqual(['cancel_pending_draft', 'schedule_post']);
    expect(out.toolCallCount).toBe(2);
    expect(emitted.map((e) => e.type)).toContain('draft_preview');
  });
});

describe('runOrchestrator — state snapshot integration', () => {
  test('renders pending action into <state> fence so the LLM sees it', async () => {
    const { deps } = makeDeps({
      pendingAction: {
        collectedData: { topics: ['launch'], platforms: ['twitter'] },
      },
    });
    mockGenerateText.mockResolvedValue({ text: 'ok' } as any);

    await runOrchestrator(deps, { message: 'after 5 minutes', history: [] });

    const args = mockGenerateText.mock.calls[0][0] as any;
    expect(args.system).toMatch(/<state>/);
    expect(args.system).toMatch(/waiting for "timing"/);
    expect(args.system).toMatch(/topic="launch"/);
  });

  test('exposes timezone and current ISO time', async () => {
    const { deps } = makeDeps();
    deps.timezone = 'America/New_York';
    mockGenerateText.mockResolvedValue({ text: '' } as any);

    await runOrchestrator(deps, { message: 'hi', history: [] });

    const args = mockGenerateText.mock.calls[0][0] as any;
    expect(args.system).toContain('2026-04-23T20:00:00.000Z');
    expect(args.system).toContain('America/New_York');
  });
});

describe('runOrchestrator — defaults', () => {
  test('omitting now/timezone falls back to current time / UTC', async () => {
    const { deps } = makeDeps();
    delete (deps as any).now;
    delete (deps as any).timezone;
    mockGenerateText.mockResolvedValue({ text: '' } as any);
    await expect(
      runOrchestrator(deps, { message: 'hi', history: [] }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStubTool(name: string, description: string): OrchestratorTool<unknown, unknown> {
  return {
    name,
    description,
    parameters: { parse: (x: unknown) => x } as any,
    handler: async () => ({ observation: 'noop' }),
  };
}
