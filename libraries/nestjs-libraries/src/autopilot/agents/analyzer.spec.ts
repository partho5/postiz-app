/**
 * Unit tests for the Analyzer agent — slices 4.4 + 4.5
 *
 * All LLM calls, memory writes, and DB interactions are mocked so tests
 * are deterministic and require no API key or database connection.
 */

jest.mock('ai-v5');
jest.mock('../memory', () => ({
  ...jest.requireActual('../memory'),
  getStructuredProfile: jest.fn(),
  writeVector: jest.fn().mockResolvedValue('mock-vector-id'),
}));

import { generateObject } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import * as memoryModule from '../memory';
import { runAnalyzer, analyzerAgent, type AnalyzerInput } from './analyzer';
import type { AgentContext } from './types';
import type { LlmProvider } from '../skills/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;
const mockGetStructuredProfile =
  memoryModule.getStructuredProfile as jest.MockedFunction<typeof memoryModule.getStructuredProfile>;
const mockWriteVector =
  memoryModule.writeVector as jest.MockedFunction<typeof memoryModule.writeVector>;

const fakeLlm: LlmProvider = {
  model: {} as LanguageModel,
  complete: jest.fn(),
};

const emptyProfile = {
  businessProfile: null as null,
  growthRules: [] as never[],
};

const richProfile = {
  businessProfile: {
    id: 'bp-1',
    niche: 'B2B SaaS',
    goals: ['grow to 10k followers', 'drive demo signups'],
    brandVoiceShort: 'professional yet approachable',
    brandVoiceExtended: 'Use data-backed insights, avoid jargon.',
    antiPatterns: ['avoid self-promotion without value'] as string[],
    regulatoryFlags: [] as never[],
    updatedAt: new Date('2026-04-01'),
    updatedBy: 'AI',
  },
  growthRules: [
    {
      id: 'gr-1',
      ruleKey: 'post_frequency',
      ruleValue: { min: 2, max: 5 },
      active: true,
      source: 'USER',
      updatedAt: new Date('2026-04-01'),
    },
  ],
};

/** Build a mock Prisma client with fully typed doubles. */
function makeDb(overrides: {
  apPublishedPost?: { findMany: jest.Mock };
  apTenantStrategyOptout?: { findUnique: jest.Mock };
  apStrategyPattern?: { upsert: jest.Mock };
} = {}) {
  return {
    apPublishedPost: {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.apPublishedPost,
    },
    apTenantStrategyOptout: {
      findUnique: jest.fn().mockResolvedValue(null), // not opted out by default
      ...overrides.apTenantStrategyOptout,
    },
    apStrategyPattern: {
      upsert: jest.fn().mockResolvedValue({}),
      ...overrides.apStrategyPattern,
    },
  } as any;
}

function makeCtx(dbOverrides?: Parameters<typeof makeDb>[0]): AgentContext {
  return {
    tenant: { id: 'tenant-42' } as any,
    user: { id: 'user-1' } as any,
    db: makeDb(dbOverrides),
    llm: fakeLlm,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
}

/** Minimal valid LLM response with one insight and one pattern. */
function mockLlmResponse(overrides?: {
  insights?: unknown[];
  patterns?: unknown[];
}) {
  mockGenerateObject.mockResolvedValueOnce({
    object: {
      insights: overrides?.insights ?? [
        {
          type: 'strength',
          title: 'High engagement on numbered lists',
          description: 'Posts using numbered lists received 3x more comments.',
          confidence: 'high',
        },
      ],
      patterns: overrides?.patterns ?? [
        {
          patternType: 'CONTENT_FORMAT',
          patternKey: 'numbered_lists_drive_engagement',
          title: 'Numbered lists increase engagement',
          description:
            'Posts structured as numbered lists consistently receive higher comment rates.',
          nicheCategory: 'B2B',
        },
      ],
    },
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStructuredProfile.mockResolvedValue(emptyProfile);
});

// ---------------------------------------------------------------------------
// Basic output shape
// ---------------------------------------------------------------------------

describe('runAnalyzer — output shape', () => {
  it('returns correct platform and periodDays', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    const result = await runAnalyzer(ctx, { platform: 'linkedin', periodDays: 14 });

    expect(result.platform).toBe('linkedin');
    expect(result.periodDays).toBe(14);
  });

  it('defaults periodDays to 30 when omitted', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    const result = await runAnalyzer(ctx, { platform: 'twitter' });

    expect(result.periodDays).toBe(30);
  });

  it('reports postsAnalyzed = 0 when DB returns no posts', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    const result = await runAnalyzer(ctx, { platform: 'twitter' });

    expect(result.postsAnalyzed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Published posts loading
// ---------------------------------------------------------------------------

describe('runAnalyzer — post loading', () => {
  it('queries apPublishedPost filtered by tenant, platform, and period', async () => {
    mockLlmResponse();
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ apPublishedPost: { findMany } });

    await runAnalyzer(ctx, { platform: 'instagram', periodDays: 7 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'tenant-42',
          platform: 'instagram',
        }),
      }),
    );
  });

  it('reports postsAnalyzed = count of returned rows', async () => {
    mockLlmResponse();
    const publishedAt = new Date();

    const mockPosts = Array.from({ length: 5 }, (_, i) => ({
      id: `pp-${i}`,
      publishedAt,
      platform: 'linkedin',
      metadata: {},
      postCandidate: {
        content: `Post content ${i}`,
        source: 'fan_out_agent',
        metadata: { hookType: 'question', hashtags: ['#saas'] },
      },
    }));

    const findMany = jest.fn().mockResolvedValue(mockPosts);
    const ctx = makeCtx({ apPublishedPost: { findMany } });

    const result = await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(result.postsAnalyzed).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

describe('runAnalyzer — LLM call', () => {
  it('calls generateObject with the system prompt', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'twitter' });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('performance analyst'),
      }),
    );
  });

  it('includes the platform in the prompt', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'tiktok' });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('tiktok'),
      }),
    );
  });

  it('includes the business profile niche in the prompt when profile exists', async () => {
    mockGetStructuredProfile.mockResolvedValueOnce(richProfile as any);
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('B2B SaaS'),
      }),
    );
  });

  it('includes analytics data label in the prompt when provided', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, {
      platform: 'linkedin',
      analyticsData: {
        supported: true,
        capturedAt: '2026-04-20T00:00:00.000Z',
        data: [
          {
            label: 'Impressions',
            data: [{ total: '12000', date: '2026-04-19' }],
            percentageChange: 15.5,
          },
        ],
      },
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Impressions'),
      }),
    );
  });

  it('notes analytics unavailable when not provided', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('not available'),
      }),
    );
  });

  it('notes analytics unavailable when supported=false', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, {
      platform: 'instagram',
      analyticsData: { supported: false, capturedAt: '2026-04-20', data: [] },
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('not available'),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Memory writing (slice 4.4)
// ---------------------------------------------------------------------------

describe('runAnalyzer — memory writing', () => {
  it('writes one LEARNING memory entry per insight', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        insights: [
          { type: 'strength', title: 'A', description: 'DA', confidence: 'high' },
          { type: 'weakness', title: 'B', description: 'DB', confidence: 'medium' },
          { type: 'learning', title: 'C', description: 'DC', confidence: 'low' },
        ],
        patterns: [],
      },
    } as any);

    const ctx = makeCtx();

    const result = await runAnalyzer(ctx, { platform: 'twitter' });

    expect(mockWriteVector).toHaveBeenCalledTimes(3);
    expect(result.stored).toBe(3);
    // Each call must write LEARNING kind
    for (const call of mockWriteVector.mock.calls) {
      expect(call[2]).toMatchObject({ kind: 'LEARNING' });
    }
  });

  it('writes LEARNING entries scoped to the correct tenant', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(mockWriteVector).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      expect.objectContaining({ kind: 'LEARNING' }),
    );
  });

  it('includes insight type in the stored content', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        insights: [
          { type: 'opportunity', title: 'Try Reels', description: 'Reels reach more people.', confidence: 'medium' },
        ],
        patterns: [],
      },
    } as any);

    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'instagram' });

    expect(mockWriteVector).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      expect.objectContaining({
        kind: 'LEARNING',
        content: expect.stringContaining('[OPPORTUNITY]'),
      }),
    );
  });

  it('includes sourceRef with platform and confidence', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    await runAnalyzer(ctx, { platform: 'twitter', periodDays: 14 });

    expect(mockWriteVector).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      expect.objectContaining({
        sourceRef: expect.objectContaining({
          platform: 'twitter',
          periodDays: 14,
        }),
      }),
    );
  });

  it('continues writing other insights when one write fails', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        insights: [
          { type: 'strength', title: 'A', description: 'DA', confidence: 'high' },
          { type: 'weakness', title: 'B', description: 'DB', confidence: 'medium' },
        ],
        patterns: [],
      },
    } as any);

    // First write fails, second succeeds
    mockWriteVector
      .mockRejectedValueOnce(new Error('embedding timeout'))
      .mockResolvedValueOnce('id-2');

    const ctx = makeCtx();

    const result = await runAnalyzer(ctx, { platform: 'linkedin' });

    // stored reflects only the successful write
    expect(result.stored).toBe(1);
    expect((ctx.logger.warn as jest.Mock)).toHaveBeenCalledWith(
      expect.stringContaining('failed to write insight'),
    );
  });
});

// ---------------------------------------------------------------------------
// Strategy pattern extraction (slice 4.5)
// ---------------------------------------------------------------------------

describe('runAnalyzer — strategy pattern extraction (4.5)', () => {
  it('upserts patterns when tenant has not opted out', async () => {
    mockLlmResponse({
      insights: [{ type: 'strength', title: 'T', description: 'D', confidence: 'high' }],
      patterns: [
        {
          patternType: 'CONTENT_FORMAT',
          patternKey: 'numbered_lists_drive_comments',
          title: 'Numbered lists drive comments',
          description: 'Lists generate discussion.',
        },
      ],
    });

    const upsert = jest.fn().mockResolvedValue({});
    const ctx = makeCtx({ apStrategyPattern: { upsert } });

    const result = await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform_patternKey: { platform: 'linkedin', patternKey: 'numbered_lists_drive_comments' } },
        create: expect.objectContaining({
          platform: 'linkedin',
          patternKey: 'numbered_lists_drive_comments',
          evidenceCount: 1,
        }),
        update: expect.objectContaining({
          evidenceCount: { increment: 1 },
        }),
      }),
    );
    expect(result.patternsExtracted).toBe(1);
    expect(result.optedOut).toBe(false);
  });

  it('skips pattern extraction when tenant has opted out', async () => {
    mockLlmResponse({
      patterns: [
        {
          patternType: 'ENGAGEMENT_HOOK',
          patternKey: 'question_hooks_drive_replies',
          title: 'Questions drive replies',
          description: 'Opening with a question doubles reply rate.',
        },
      ],
    });

    const upsert = jest.fn();
    // Opt-out row present
    const findUnique = jest.fn().mockResolvedValue({ id: 'optout-1' });
    const ctx = makeCtx({
      apTenantStrategyOptout: { findUnique },
      apStrategyPattern: { upsert },
    });

    const result = await runAnalyzer(ctx, { platform: 'twitter' });

    expect(upsert).not.toHaveBeenCalled();
    expect(result.patternsExtracted).toBe(0);
    expect(result.optedOut).toBe(true);
  });

  it('produces 0 patterns when LLM returns empty patterns array', async () => {
    mockLlmResponse({ patterns: [] });

    const upsert = jest.fn();
    const ctx = makeCtx({ apStrategyPattern: { upsert } });

    const result = await runAnalyzer(ctx, { platform: 'instagram' });

    expect(upsert).not.toHaveBeenCalled();
    expect(result.patternsExtracted).toBe(0);
  });

  it('upserts multiple patterns in parallel', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        insights: [{ type: 'learning', title: 'T', description: 'D', confidence: 'low' }],
        patterns: [
          {
            patternType: 'TIMING',
            patternKey: 'morning_posts_outperform',
            title: 'Morning posts outperform',
            description: 'Posts at 8-9am UTC get 25% more reach.',
          },
          {
            patternType: 'TONE',
            patternKey: 'conversational_tone_boosts_saves',
            title: 'Conversational tone boosts saves',
            description: 'First-person writing generates more saves.',
          },
        ],
      },
    } as any);

    const upsert = jest.fn().mockResolvedValue({});
    const ctx = makeCtx({ apStrategyPattern: { upsert } });

    const result = await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(result.patternsExtracted).toBe(2);
  });

  it('warns and continues when a pattern upsert fails', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        insights: [],
        patterns: [
          {
            patternType: 'HASHTAG_STRATEGY',
            patternKey: 'fewer_hashtags_more_reach',
            title: 'Fewer hashtags, more reach',
            description: '3 hashtags outperform 10+.',
          },
        ],
      },
    } as any);

    const upsert = jest.fn().mockRejectedValue(new Error('db error'));
    const ctx = makeCtx({ apStrategyPattern: { upsert } });

    const result = await runAnalyzer(ctx, { platform: 'instagram' });

    // Failure is logged, not thrown
    expect(result.patternsExtracted).toBe(0);
    expect((ctx.logger.warn as jest.Mock)).toHaveBeenCalledWith(
      expect.stringContaining('failed to upsert pattern'),
    );
  });

  it('passes nicheCategory to the upsert when provided', async () => {
    mockLlmResponse({
      patterns: [
        {
          patternType: 'CONTENT_FORMAT',
          patternKey: 'case_studies_drive_shares',
          title: 'Case studies drive shares',
          description: 'Real-world case studies get more organic sharing.',
          nicheCategory: 'B2B SaaS',
        },
      ],
    });

    const upsert = jest.fn().mockResolvedValue({});
    const ctx = makeCtx({ apStrategyPattern: { upsert } });

    await runAnalyzer(ctx, { platform: 'linkedin' });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ niche: 'B2B SaaS' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AgentDefinition contract
// ---------------------------------------------------------------------------

describe('analyzerAgent', () => {
  it('has the expected id', () => {
    expect(analyzerAgent.id).toBe('analyzer');
  });

  it('declares analytics_snapshot as an allowed skill', () => {
    expect(analyzerAgent.allowedSkills).toContain('analytics_snapshot');
  });

  it('has a non-empty system prompt', () => {
    expect(analyzerAgent.systemPrompt.length).toBeGreaterThan(50);
  });

  it('run() delegates to runAnalyzer', async () => {
    mockLlmResponse();
    const ctx = makeCtx();

    const result = await analyzerAgent.run(ctx, { platform: 'twitter' });

    expect(result.platform).toBe('twitter');
  });
});
