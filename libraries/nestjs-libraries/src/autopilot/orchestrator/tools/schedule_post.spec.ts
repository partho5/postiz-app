import { createSchedulePostTool } from './schedule_post';
import type { OrchestratorContext } from '../types';
import type { DirectActionData } from '../../agents/intent_parser';

const NOW = new Date('2026-04-23T20:00:00Z');

interface CtxFixture {
  ctx: OrchestratorContext;
  startFlow: jest.Mock;
  emitted: any[];
  /** Pending action returned by `findUnique`. Mutate per-test. */
  pending: { collectedData: unknown; expiresAt: Date } | null;
}

function makeFixture(opts: {
  pending?: { collectedData: unknown; expiresAt?: Date } | null;
  /** What startFlow should "emit" when invoked. */
  startFlowEmits?: Array<{ type: string } & Record<string, unknown>>;
  /** Throw from startFlow. */
  startFlowError?: Error;
  timezone?: string;
}): CtxFixture {
  const emitted: any[] = [];
  const pending = opts.pending
    ? {
        collectedData: opts.pending.collectedData,
        expiresAt:
          opts.pending.expiresAt ?? new Date(NOW.getTime() + 30 * 60_000),
      }
    : null;

  const startFlow = jest.fn(async (_org, _user, _data, _llm, emit) => {
    if (opts.startFlowError) throw opts.startFlowError;
    for (const ev of opts.startFlowEmits ?? []) {
      emit(ev);
    }
    return '';
  });

  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apPendingAction: {
        findUnique: jest.fn().mockResolvedValue(pending),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: (e) => emitted.push(e),
    now: NOW,
    timezone: opts.timezone ?? 'UTC',
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };

  return { ctx, startFlow, emitted, pending };
}

describe('schedule_post tool — time resolution', () => {
  test('parses "after 5 minutes" deterministically and passes ISO to startFlow', async () => {
    const f = makeFixture({});
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    const result = await tool.handler(f.ctx, { when: 'after 5 minutes' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.scheduleAt).toBe('2026-04-23T20:05:00.000Z');
    expect(passed.publishImmediately).toBeUndefined();
    expect(result.data?.resolvedScheduleAt).toBe('2026-04-23T20:05:00.000Z');
  });

  test('parses "tomorrow 9am" against user timezone (NY → 13:00 UTC)', async () => {
    const f = makeFixture({ timezone: 'America/New_York' });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    await tool.handler(f.ctx, { when: 'tomorrow 9am' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.scheduleAt).toBe('2026-04-24T13:00:00.000Z');
  });

  test('immediate=true takes precedence; no scheduleAt set', async () => {
    const f = makeFixture({});
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    await tool.handler(f.ctx, { immediate: true, when: 'tomorrow 9am' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.publishImmediately).toBe(true);
    expect(passed.scheduleAt).toBeUndefined();
  });

  test('unparseable "when" leaves timing unset (does NOT default to immediate)', async () => {
    const f = makeFixture({});
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    await tool.handler(f.ctx, { when: 'gibberish phrase that nothing parses' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.publishImmediately).toBeUndefined();
    expect(passed.scheduleAt).toBeUndefined();
    expect(f.ctx.logger.warn).toHaveBeenCalled();
  });

  test('past time leaves timing unset (does NOT silently schedule the past)', async () => {
    // forwardOnly is true by default in the tool, but a strict ISO past time
    // bypasses chrono's roll-forward heuristic.
    const f = makeFixture({});
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    await tool.handler(f.ctx, { when: '2020-01-01T00:00:00Z' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.scheduleAt).toBeUndefined();
    expect(f.ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/in the past/),
    );
  });
});

describe('schedule_post tool — merge with pending action', () => {
  test('preserves prior topic + platforms when only timing arrives', async () => {
    const f = makeFixture({
      pending: {
        collectedData: {
          topic: 'launch announcement',
          platforms: ['twitter'],
        },
      },
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });

    await tool.handler(f.ctx, { when: 'after 5 minutes' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.topic).toBe('launch announcement');
    expect(passed.platforms).toEqual(['twitter']);
    expect(passed.scheduleAt).toBe('2026-04-23T20:05:00.000Z');
  });

  test('explicit immediate=true clears any prior scheduleAt', async () => {
    const f = makeFixture({
      pending: {
        collectedData: { scheduleAt: '2030-01-01T00:00:00Z' },
      },
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });

    await tool.handler(f.ctx, { immediate: true });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.publishImmediately).toBe(true);
    expect(passed.scheduleAt).toBeUndefined();
  });

  test('new scheduleAt overrides prior publishImmediately', async () => {
    const f = makeFixture({
      pending: {
        collectedData: { publishImmediately: true },
      },
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });

    await tool.handler(f.ctx, { when: 'tomorrow 9am' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.publishImmediately).toBeUndefined();
    expect(passed.scheduleAt).toBe('2026-04-24T09:00:00.000Z');
  });

  test('expired pending action is ignored (no merge)', async () => {
    const f = makeFixture({
      pending: {
        collectedData: { topic: 'old topic' },
        expiresAt: new Date(NOW.getTime() - 60_000),
      },
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });

    await tool.handler(f.ctx, { topic: 'new topic' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.topic).toBe('new topic');
  });

  test('new platforms array replaces prior (not concatenated)', async () => {
    const f = makeFixture({
      pending: { collectedData: { platforms: ['twitter'] } },
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    await tool.handler(f.ctx, { platforms: ['linkedin'] });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.platforms).toEqual(['linkedin']);
  });
});

describe('schedule_post tool — observation reflects state-machine outcome', () => {
  test('preview emitted → observation tells the LLM to wait for user confirm', async () => {
    const f = makeFixture({
      startFlowEmits: [
        {
          type: 'draft_preview',
          pendingActionId: 'pa-1',
          drafts: [{ platform: 'twitter', content: 'Hi' }],
          publishAt: '2026-04-23T20:05:00.000Z',
        },
      ],
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    const result = await tool.handler(f.ctx, { when: 'after 5 minutes' });

    expect(result.data?.stage).toBe('preview_emitted');
    expect(result.observation).toMatch(/draft preview/i);
    expect(result.observation).toMatch(/wait/i);
    expect(result.emitted).toBe(true);
  });

  test('follow-up question → observation tells the LLM to stop', async () => {
    const f = makeFixture({
      startFlowEmits: [{ type: 'text', chunk: 'Which platform?' }],
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    const result = await tool.handler(f.ctx, {});

    expect(result.data?.stage).toBe('follow_up_question');
    expect(result.observation).toMatch(/follow-up question/i);
    expect(result.emitted).toBe(true);
  });

  test('startFlow throws → reported as noop with error in observation', async () => {
    const f = makeFixture({ startFlowError: new Error('llm down') });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    const result = await tool.handler(f.ctx, { topic: 'x' });

    expect(result.data?.stage).toBe('noop');
    expect(result.observation).toMatch(/llm down/);
  });
});

describe('schedule_post tool — failing-scenario regression', () => {
  test('"after 5 minutes" follow-up resolves to now+5min and reaches preview', async () => {
    // Simulates the user's bug: pending action is waiting on timing, the
    // user replies with a relative phrase, the orchestrator calls
    // schedule_post({ when: "after 5 minutes" }), and we expect a draft
    // preview at exactly 5 min from `now` — NOT another "Post now or
    // schedule it?" loop.
    const f = makeFixture({
      pending: {
        collectedData: {
          topic: 'saas at insight valley',
          platforms: ['twitter'],
        },
      },
      startFlowEmits: [
        {
          type: 'draft_preview',
          pendingActionId: 'pa-1',
          drafts: [{ platform: 'twitter', content: 'SaaS at Insight Valley…' }],
          publishAt: '2026-04-23T20:05:00.000Z',
        },
      ],
    });
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });

    const result = await tool.handler(f.ctx, { when: 'after 5 minutes' });

    const passed = f.startFlow.mock.calls[0][2] as DirectActionData;
    expect(passed.scheduleAt).toBe('2026-04-23T20:05:00.000Z');
    expect(passed.topic).toBe('saas at insight valley');
    expect(passed.platforms).toEqual(['twitter']);
    expect(result.data?.stage).toBe('preview_emitted');
  });
});

describe('schedule_post tool — schema', () => {
  test('rejects negative count', () => {
    const f = makeFixture({});
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    expect(() => tool.parameters.parse({ countPerPlatform: 0 })).toThrow();
    expect(() => tool.parameters.parse({ countPerPlatform: 99 })).toThrow();
  });

  test('description tells LLM to call cancel_pending_draft for fresh starts', () => {
    const f = makeFixture({});
    const tool = createSchedulePostTool({ directAction: { startFlow: f.startFlow } });
    expect(tool.description).toMatch(/cancel_pending_draft/);
    expect(tool.description).toMatch(/MERGES/);
  });
});
