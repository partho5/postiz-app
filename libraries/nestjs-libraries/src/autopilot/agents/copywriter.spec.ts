/**
 * Unit tests for the Copywriter agent — slice 3.1
 *
 * generateObject, getStructuredProfile, and queryVector are mocked so
 * tests are deterministic and require no API key or database connection.
 */

jest.mock('ai-v5');
jest.mock('../memory', () => ({
  ...jest.requireActual('../memory'),
  getStructuredProfile: jest.fn(),
  queryVector: jest.fn(),
}));

import { generateObject } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import * as memoryModule from '../memory';
import { runCopywriter, copywriterAgent } from './copywriter';
import type { CopywriterInput } from './copywriter';
import type { AgentContext } from './types';
import type { LlmProvider } from '../skills/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;
const mockGetStructuredProfile = memoryModule.getStructuredProfile as jest.MockedFunction<
  typeof memoryModule.getStructuredProfile
>;
const mockQueryVector = memoryModule.queryVector as jest.MockedFunction<
  typeof memoryModule.queryVector
>;

const fakeLlm: LlmProvider = {
  model: {} as LanguageModel,
  complete: jest.fn(),
};

function makeCtx(): AgentContext {
  return {
    tenant: { id: 'tenant-42' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: fakeLlm,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
}

const MOCK_PROFILE: memoryModule.StructuredProfile = {
  businessProfile: {
    id: 'bp-1',
    niche: 'SaaS productivity tools',
    goals: ['grow audience', 'drive signups'],
    brandVoiceShort: 'Friendly, professional, and slightly witty',
    brandVoiceExtended: 'We explain complex things simply. No jargon. Use analogies.',
    antiPatterns: ['clickbait titles', 'aggressive sales language'],
    regulatoryFlags: [],
    updatedAt: new Date(),
    updatedBy: 'user',
  },
  growthRules: [
    {
      id: 'gr-1',
      ruleKey: 'posting_focus',
      ruleValue: 'Prioritise educational content',
      active: true,
      source: 'USER',
      updatedAt: new Date(),
    },
  ],
};

const MOCK_MEMORY: memoryModule.VectorMemoryRow[] = [
  {
    id: 'mem-1',
    organizationId: 'tenant-42',
    kind: 'ANECDOTE' as any,
    content: 'We once grew our newsletter from 500 to 5000 in one month via a viral thread.',
    sourceRef: null,
    freshnessTtlDays: null,
    createdAt: new Date(),
    similarity: 0.87,
  },
  {
    id: 'mem-2',
    organizationId: 'tenant-42',
    kind: 'BRAND_RULE' as any,
    content: 'Always open with a question or a bold statement.',
    sourceRef: null,
    freshnessTtlDays: null,
    createdAt: new Date(),
    similarity: 0.82,
  },
];

function stubLlmDrafts(drafts: Array<{ content: string; hookType?: string; cta?: string; hashtags?: string[] }>) {
  mockGenerateObject.mockResolvedValueOnce({
    object: { drafts },
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStructuredProfile.mockResolvedValue(MOCK_PROFILE);
  mockQueryVector.mockResolvedValue(MOCK_MEMORY);
});

// ---------------------------------------------------------------------------
// Single draft generation
// ---------------------------------------------------------------------------

describe('runCopywriter — single draft', () => {
  it('generates a single draft when count is 1 (default)', async () => {
    stubLlmDrafts([
      {
        content: 'What if your team could save 2 hours a day? Here is how we made it happen.',
        hookType: 'question',
        cta: 'Try our free plan today',
        hashtags: ['productivity', 'SaaS'],
      },
    ]);

    const result = await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'productivity tips for remote teams',
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].content).toContain('save 2 hours');
    expect(result.drafts[0].characterCount).toBeGreaterThan(0);
    expect(result.drafts[0].hookType).toBe('question');
    expect(result.drafts[0].hashtags).toEqual(['productivity', 'SaaS']);
  });

  it('computes characterCount from content length', async () => {
    const text = 'Short post!';
    stubLlmDrafts([{ content: text }]);

    const result = await runCopywriter(makeCtx(), {
      platform: 'linkedin',
      topic: 'anything',
    });

    expect(result.drafts[0].characterCount).toBe(text.length);
  });
});

// ---------------------------------------------------------------------------
// Multiple drafts
// ---------------------------------------------------------------------------

describe('runCopywriter — multiple drafts', () => {
  it('generates multiple drafts when count > 1', async () => {
    stubLlmDrafts([
      { content: 'Draft A: question hook', hookType: 'question' },
      { content: 'Draft B: bold claim hook', hookType: 'bold_claim' },
      { content: 'Draft C: story hook', hookType: 'story' },
    ]);

    const result = await runCopywriter(makeCtx(), {
      platform: 'linkedin',
      topic: 'remote work culture',
      count: 3,
    });

    expect(result.drafts).toHaveLength(3);
    expect(result.drafts[0].hookType).toBe('question');
    expect(result.drafts[2].hookType).toBe('story');
  });

  it('clamps count between 1 and 10', async () => {
    stubLlmDrafts([{ content: 'Only one draft' }]);

    await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'test',
      count: 0, // should become 1
    });

    // The prompt should say "Write 1 ..." because count clamped to 1.
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Write 1'),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Brand voice injection
// ---------------------------------------------------------------------------

describe('runCopywriter — brand voice', () => {
  it('includes brand voice in system prompt when profile exists', async () => {
    stubLlmDrafts([{ content: 'Voice-aware draft' }]);

    await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'product launch',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Friendly, professional, and slightly witty');
    expect(systemPrompt).toContain('SaaS productivity tools');
    expect(systemPrompt).toContain('clickbait titles');
  });

  it('includes growth rules in system prompt', async () => {
    stubLlmDrafts([{ content: 'A draft' }]);

    await runCopywriter(makeCtx(), {
      platform: 'linkedin',
      topic: 'content strategy',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('posting_focus');
    expect(systemPrompt).toContain('educational content');
  });
});

// ---------------------------------------------------------------------------
// Memory context injection
// ---------------------------------------------------------------------------

describe('runCopywriter — memory context', () => {
  it('queries vector memory with the topic', async () => {
    stubLlmDrafts([{ content: 'A draft' }]);

    await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'newsletter growth',
    });

    expect(mockQueryVector).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      'newsletter growth',
      5,
      expect.any(Array),
    );
  });

  it('includes memory context in system prompt', async () => {
    stubLlmDrafts([{ content: 'Memory-aware draft' }]);

    await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'viral content',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('newsletter from 500 to 5000');
    expect(systemPrompt).toContain('Always open with a question');
  });
});

// ---------------------------------------------------------------------------
// Missing profile / memory graceful fallback
// ---------------------------------------------------------------------------

describe('runCopywriter — graceful fallback', () => {
  it('generates a draft even when profile is missing', async () => {
    mockGetStructuredProfile.mockRejectedValueOnce(new Error('table missing'));
    stubLlmDrafts([{ content: 'Generic draft without voice' }]);

    const result = await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'test topic',
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].content).toBe('Generic draft without voice');
  });

  it('generates a draft even when vector memory is unavailable', async () => {
    mockQueryVector.mockRejectedValueOnce(new Error('no embedding key'));
    stubLlmDrafts([{ content: 'Draft without memory' }]);

    const result = await runCopywriter(makeCtx(), {
      platform: 'linkedin',
      topic: 'test topic',
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].content).toBe('Draft without memory');
  });

  it('generates when profile has no businessProfile (null)', async () => {
    mockGetStructuredProfile.mockResolvedValueOnce({
      businessProfile: null,
      growthRules: [],
    });
    stubLlmDrafts([{ content: 'Draft without profile' }]);

    const result = await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'anything',
    });

    expect(result.drafts).toHaveLength(1);
    // System prompt should still work — just without brand voice sections.
    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).not.toContain('Brand identity');
  });
});

// ---------------------------------------------------------------------------
// Platform-specific system prompt
// ---------------------------------------------------------------------------

describe('runCopywriter — platform awareness', () => {
  it('includes Twitter character limit in system prompt', async () => {
    stubLlmDrafts([{ content: 'Tweet' }]);

    await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'test',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('280 characters');
    expect(systemPrompt).toContain('Twitter / X');
  });

  it('includes LinkedIn conventions in system prompt', async () => {
    stubLlmDrafts([{ content: 'LinkedIn post' }]);

    await runCopywriter(makeCtx(), {
      platform: 'linkedin',
      topic: 'test',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('LinkedIn');
    expect(systemPrompt).toContain('3000');
  });

  it('falls back to generic spec for unknown platforms', async () => {
    stubLlmDrafts([{ content: 'Post for unknown platform' }]);

    await runCopywriter(makeCtx(), {
      platform: 'mastodon',
      topic: 'test',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Social media');
    expect(systemPrompt).not.toContain('Hard character limit');
  });
});

// ---------------------------------------------------------------------------
// Guidelines passthrough
// ---------------------------------------------------------------------------

describe('runCopywriter — guidelines', () => {
  it('includes user guidelines in system prompt', async () => {
    stubLlmDrafts([{ content: 'Draft with guidelines' }]);

    await runCopywriter(makeCtx(), {
      platform: 'twitter',
      topic: 'product launch',
      guidelines: 'Mention the May 5th launch date and include a link placeholder',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('May 5th launch date');
  });
});

// ---------------------------------------------------------------------------
// AgentDefinition contract
// ---------------------------------------------------------------------------

describe('copywriterAgent', () => {
  it('has the expected id', () => {
    expect(copywriterAgent.id).toBe('copywriter');
  });

  it('has a system prompt', () => {
    expect(copywriterAgent.systemPrompt).toContain('copywriter');
  });

  it('declares no allowed skills', () => {
    expect(copywriterAgent.allowedSkills).toHaveLength(0);
  });

  it('run() delegates to runCopywriter', async () => {
    stubLlmDrafts([{ content: 'Agent run draft' }]);

    const ctx = makeCtx();
    const result = await copywriterAgent.run(ctx, {
      platform: 'twitter',
      topic: 'testing',
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].content).toBe('Agent run draft');
  });
});
