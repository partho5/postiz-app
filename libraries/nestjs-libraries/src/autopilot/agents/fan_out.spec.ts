/**
 * Unit tests for the Fan-out agent — slice 3.2
 *
 * runCopywriter and push are mocked so tests are deterministic and
 * require no API key, database, or LLM connection.
 */

jest.mock('./copywriter', () => ({
  ...jest.requireActual('./copywriter'),
  runCopywriter: jest.fn(),
}));

jest.mock('../stack', () => ({
  ...jest.requireActual('../stack'),
  push: jest.fn(),
}));

import type { LanguageModel } from 'ai-v5';
import { runCopywriter } from './copywriter';
import type { CopywriterOutput } from './copywriter';
import { push } from '../stack';
import { runFanOut, fanOutAgent } from './fan_out';
import type { FanOutInput } from './fan_out';
import type { AgentContext } from './types';
import type { LlmProvider } from '../skills/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRunCopywriter = runCopywriter as jest.MockedFunction<typeof runCopywriter>;
const mockPush = push as jest.MockedFunction<typeof push>;

const fakeLlm: LlmProvider = {
  model: {} as LanguageModel,
  complete: jest.fn(),
};

function makeCtx(overrides?: Partial<AgentContext>): AgentContext {
  return {
    tenant: { id: 'tenant-42' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apCadenceConfig: {
        findMany: jest.fn().mockResolvedValue([
          { platform: 'twitter' },
          { platform: 'linkedin' },
        ]),
      },
    } as any,
    llm: fakeLlm,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    ...overrides,
  };
}

function stubCopywriterDrafts(drafts: Array<{ content: string; hookType?: string; cta?: string; hashtags?: string[] }>) {
  const output: CopywriterOutput = {
    drafts: drafts.map((d) => ({
      ...d,
      characterCount: d.content.length,
    })),
  };
  mockRunCopywriter.mockResolvedValueOnce(output);
}

function stubPush(id: string) {
  mockPush.mockResolvedValueOnce({ id } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Basic fan-out with explicit platforms
// ---------------------------------------------------------------------------

describe('runFanOut — explicit platforms', () => {
  it('generates and pushes drafts for each specified platform', async () => {
    stubCopywriterDrafts([{ content: 'Tweet about AI' }]);
    stubPush('cand-1');
    stubCopywriterDrafts([{ content: 'LinkedIn post about AI' }]);
    stubPush('cand-2');

    const result = await runFanOut(makeCtx(), {
      topic: 'AI trends',
      platforms: ['twitter', 'linkedin'],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].platform).toBe('twitter');
    expect(result.results[0].pushed).toBe(1);
    expect(result.results[0].candidateIds).toEqual(['cand-1']);
    expect(result.results[1].platform).toBe('linkedin');
    expect(result.results[1].pushed).toBe(1);
    expect(result.results[1].candidateIds).toEqual(['cand-2']);
    expect(result.skipped).toHaveLength(0);
  });

  it('passes topic and guidelines to copywriter', async () => {
    stubCopywriterDrafts([{ content: 'Draft' }]);
    stubPush('cand-1');

    await runFanOut(makeCtx(), {
      topic: 'product launch',
      platforms: ['twitter'],
      guidelines: 'Mention May 5th date',
    });

    expect(mockRunCopywriter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'twitter',
        topic: 'product launch',
        count: 1,
        guidelines: 'Mention May 5th date',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Auto-resolve platforms from cadence config
// ---------------------------------------------------------------------------

describe('runFanOut — auto-resolve platforms', () => {
  it('queries cadence config when no platforms specified', async () => {
    const ctx = makeCtx();
    stubCopywriterDrafts([{ content: 'Tweet' }]);
    stubPush('cand-1');
    stubCopywriterDrafts([{ content: 'LinkedIn post' }]);
    stubPush('cand-2');

    const result = await runFanOut(ctx, { topic: 'AI trends' });

    expect(result.results).toHaveLength(2);
    expect(result.results.map((r) => r.platform)).toEqual(['twitter', 'linkedin']);
    expect((ctx.db as any).apCadenceConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'tenant-42',
          active: true,
        }),
      }),
    );
  });

  it('returns empty results when no active platforms exist', async () => {
    const ctx = makeCtx({
      db: {
        apCadenceConfig: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any,
    });

    const result = await runFanOut(ctx, { topic: 'anything' });

    expect(result.results).toHaveLength(0);
    expect(result.skipped).toEqual([{ platform: '*', reason: 'no_active_platforms' }]);
    expect(mockRunCopywriter).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Multiple drafts per platform
// ---------------------------------------------------------------------------

describe('runFanOut — multiple drafts', () => {
  it('pushes multiple candidates when countPerPlatform > 1', async () => {
    stubCopywriterDrafts([
      { content: 'Draft A' },
      { content: 'Draft B' },
    ]);
    stubPush('cand-1');
    stubPush('cand-2');

    const result = await runFanOut(makeCtx(), {
      topic: 'AI',
      platforms: ['twitter'],
      countPerPlatform: 2,
    });

    expect(result.results[0].pushed).toBe(2);
    expect(result.results[0].candidateIds).toEqual(['cand-1', 'cand-2']);
    expect(mockRunCopywriter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 2 }),
    );
  });

  it('clamps countPerPlatform to [1, 5]', async () => {
    stubCopywriterDrafts([{ content: 'Draft' }]);
    stubPush('cand-1');

    await runFanOut(makeCtx(), {
      topic: 'test',
      platforms: ['twitter'],
      countPerPlatform: 0, // should become 1
    });

    expect(mockRunCopywriter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Priority and metadata
// ---------------------------------------------------------------------------

describe('runFanOut — push options', () => {
  it('pushes with default priority 10 and source fan_out_agent', async () => {
    stubCopywriterDrafts([{ content: 'Post', hookType: 'question', cta: 'Try it', hashtags: ['AI'] }]);
    stubPush('cand-1');

    await runFanOut(makeCtx(), {
      topic: 'AI trends',
      platforms: ['twitter'],
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      'twitter',
      'Post',
      expect.objectContaining({
        priority: 10,
        source: 'fan_out_agent',
        metadata: {
          topic: 'AI trends',
          hookType: 'question',
          cta: 'Try it',
          hashtags: ['AI'],
        },
      }),
    );
  });

  it('uses custom priority when specified', async () => {
    stubCopywriterDrafts([{ content: 'Urgent post' }]);
    stubPush('cand-1');

    await runFanOut(makeCtx(), {
      topic: 'breaking news',
      platforms: ['twitter'],
      priority: 100,
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      'twitter',
      'Urgent post',
      expect.objectContaining({ priority: 100 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling — per-platform isolation
// ---------------------------------------------------------------------------

describe('runFanOut — error isolation', () => {
  it('skips a platform when copywriter fails and continues with others', async () => {
    mockRunCopywriter.mockRejectedValueOnce(new Error('LLM down'));
    stubCopywriterDrafts([{ content: 'LinkedIn post works' }]);
    stubPush('cand-2');

    const result = await runFanOut(makeCtx(), {
      topic: 'test',
      platforms: ['twitter', 'linkedin'],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].platform).toBe('linkedin');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].platform).toBe('twitter');
    expect(result.skipped[0].reason).toContain('copywriter_error');
  });

  it('skips a platform when copywriter returns zero drafts', async () => {
    mockRunCopywriter.mockResolvedValueOnce({ drafts: [] });

    const result = await runFanOut(makeCtx(), {
      topic: 'test',
      platforms: ['twitter'],
    });

    expect(result.results).toHaveLength(0);
    expect(result.skipped).toEqual([{ platform: 'twitter', reason: 'no_drafts_generated' }]);
  });
});

// ---------------------------------------------------------------------------
// AgentDefinition contract
// ---------------------------------------------------------------------------

describe('fanOutAgent', () => {
  it('has the expected id', () => {
    expect(fanOutAgent.id).toBe('fan_out');
  });

  it('has a system prompt', () => {
    expect(fanOutAgent.systemPrompt).toContain('fan-out');
  });

  it('declares no allowed skills', () => {
    expect(fanOutAgent.allowedSkills).toHaveLength(0);
  });

  it('run() delegates to runFanOut', async () => {
    stubCopywriterDrafts([{ content: 'Agent run draft' }]);
    stubPush('cand-1');

    const ctx = makeCtx();
    const result = await fanOutAgent.run(ctx, {
      topic: 'testing',
      platforms: ['twitter'],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].pushed).toBe(1);
  });
});
