/**
 * Unit tests for the Platform rewrite skill — slice 3.3
 *
 * generateObject and getStructuredProfile are mocked so tests are
 * deterministic and require no API key or database connection.
 */

jest.mock('ai-v5');
jest.mock('../memory', () => ({
  ...jest.requireActual('../memory'),
  getStructuredProfile: jest.fn(),
}));

import { generateObject } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import * as memoryModule from '../memory';
import {
  handleRewrite,
  rewriteForPlatformSkill,
  buildRewritePrompt,
} from './rewrite_for_platform';
import type { RewriteInput } from './rewrite_for_platform';
import type { SkillContext, LlmProvider } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGenerateObject = generateObject as jest.MockedFunction<
  typeof generateObject
>;
const mockGetStructuredProfile =
  memoryModule.getStructuredProfile as jest.MockedFunction<
    typeof memoryModule.getStructuredProfile
  >;

const fakeLlm: LlmProvider = {
  model: {} as LanguageModel,
  complete: jest.fn(),
};

function makeCtx(): SkillContext {
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
    brandVoiceExtended:
      'We explain complex things simply. No jargon. Use analogies.',
    antiPatterns: ['clickbait titles', 'aggressive sales language'],
    regulatoryFlags: [],
    updatedAt: new Date(),
    updatedBy: 'user',
  },
  growthRules: [],
};

function stubRewriteResult(result: {
  content: string;
  hookType?: string;
  cta?: string;
  hashtags?: string[];
}) {
  mockGenerateObject.mockResolvedValueOnce({
    object: result,
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStructuredProfile.mockResolvedValue(MOCK_PROFILE);
});

// ---------------------------------------------------------------------------
// Basic rewrite
// ---------------------------------------------------------------------------

describe('handleRewrite — basic rewrite', () => {
  it('rewrites a Twitter draft for LinkedIn', async () => {
    stubRewriteResult({
      content:
        'Remote teams can save 2 hours a day with the right tools. Here is what we learned after switching...',
      hookType: 'story',
      cta: 'Read the full case study in the comments',
      hashtags: ['productivity', 'remotework', 'SaaS'],
    });

    const result = await handleRewrite(makeCtx(), {
      draft: 'Save 2h/day with remote tools. Thread:',
      sourcePlatform: 'twitter',
      targetPlatform: 'linkedin',
    });

    expect(result.content).toContain('Remote teams');
    expect(result.characterCount).toBeGreaterThan(0);
    expect(result.characterCount).toBe(result.content.length);
    expect(result.hookType).toBe('story');
    expect(result.cta).toContain('case study');
    expect(result.hashtags).toEqual(['productivity', 'remotework', 'SaaS']);
    expect(result.originalDraft).toBe(
      'Save 2h/day with remote tools. Thread:',
    );
    expect(result.platform).toBe('linkedin');
  });

  it('preserves the original draft in the output', async () => {
    const original = 'Original tweet content here';
    stubRewriteResult({ content: 'Rewritten for LinkedIn' });

    const result = await handleRewrite(makeCtx(), {
      draft: original,
      targetPlatform: 'linkedin',
    });

    expect(result.originalDraft).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Platform awareness in prompt
// ---------------------------------------------------------------------------

describe('handleRewrite — platform-specific prompt', () => {
  it('includes target platform conventions in system prompt', async () => {
    stubRewriteResult({ content: 'Rewritten content' });

    await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'twitter',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Twitter / X');
    expect(systemPrompt).toContain('280 characters');
  });

  it('includes source platform context when provided', async () => {
    stubRewriteResult({ content: 'Rewritten content' });

    await handleRewrite(makeCtx(), {
      draft: 'A LinkedIn draft',
      sourcePlatform: 'linkedin',
      targetPlatform: 'twitter',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Original platform: LinkedIn');
    expect(systemPrompt).toContain('Target platform: Twitter / X');
  });

  it('omits source platform section when not provided', async () => {
    stubRewriteResult({ content: 'Rewritten content' });

    await handleRewrite(makeCtx(), {
      draft: 'A generic draft',
      targetPlatform: 'instagram',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).not.toContain('Original platform');
    expect(systemPrompt).toContain('Target platform: Instagram');
  });

  it('falls back to generic spec for unknown target platform', async () => {
    stubRewriteResult({ content: 'Rewritten for unknown' });

    await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'mastodon',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Social media');
    expect(systemPrompt).not.toContain('Hard character limit');
  });
});

// ---------------------------------------------------------------------------
// Brand voice injection
// ---------------------------------------------------------------------------

describe('handleRewrite — brand voice', () => {
  it('includes brand voice in system prompt when profile exists', async () => {
    stubRewriteResult({ content: 'Voice-aware rewrite' });

    await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'linkedin',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Friendly, professional, and slightly witty');
    expect(systemPrompt).toContain('SaaS productivity tools');
  });

  it('includes anti-patterns in system prompt', async () => {
    stubRewriteResult({ content: 'A rewrite' });

    await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'twitter',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('clickbait titles');
    expect(systemPrompt).toContain('aggressive sales language');
  });
});

// ---------------------------------------------------------------------------
// Graceful fallback
// ---------------------------------------------------------------------------

describe('handleRewrite — graceful fallback', () => {
  it('rewrites even when profile is missing', async () => {
    mockGetStructuredProfile.mockRejectedValueOnce(
      new Error('table missing'),
    );
    stubRewriteResult({ content: 'Generic rewrite' });

    const result = await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'twitter',
    });

    expect(result.content).toBe('Generic rewrite');
  });

  it('rewrites when profile has no businessProfile (null)', async () => {
    mockGetStructuredProfile.mockResolvedValueOnce({
      businessProfile: null,
      growthRules: [],
    });
    stubRewriteResult({ content: 'Rewrite without profile' });

    const result = await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'linkedin',
    });

    expect(result.content).toBe('Rewrite without profile');
    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).not.toContain('Brand identity');
  });
});

// ---------------------------------------------------------------------------
// Guidelines passthrough
// ---------------------------------------------------------------------------

describe('handleRewrite — guidelines', () => {
  it('includes user guidelines in system prompt', async () => {
    stubRewriteResult({ content: 'Guided rewrite' });

    await handleRewrite(makeCtx(), {
      draft: 'A draft',
      targetPlatform: 'twitter',
      guidelines: 'Keep it very casual and use emoji',
    });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('Keep it very casual and use emoji');
  });
});

// ---------------------------------------------------------------------------
// LLM prompt content
// ---------------------------------------------------------------------------

describe('handleRewrite — LLM prompt', () => {
  it('sends the draft in the user prompt', async () => {
    const draft = 'My original draft about productivity';
    stubRewriteResult({ content: 'Rewritten' });

    await handleRewrite(makeCtx(), {
      draft,
      targetPlatform: 'instagram',
    });

    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain(draft);
    expect(prompt).toContain('Instagram');
  });
});

// ---------------------------------------------------------------------------
// buildRewritePrompt (exported helper)
// ---------------------------------------------------------------------------

describe('buildRewritePrompt', () => {
  it('builds a prompt with source and target specs', () => {
    const result = buildRewritePrompt(
      { displayName: 'Twitter / X', maxChars: 280, conventions: 'Short.' },
      { displayName: 'LinkedIn', maxChars: 3000, conventions: 'Professional.' },
      null,
    );

    expect(result).toContain('Original platform: Twitter / X');
    expect(result).toContain('Target platform: LinkedIn');
    expect(result).toContain('3000 characters');
  });

  it('builds a prompt without source spec', () => {
    const result = buildRewritePrompt(
      null,
      { displayName: 'Instagram', maxChars: 2200, conventions: 'Visual.' },
      null,
    );

    expect(result).not.toContain('Original platform');
    expect(result).toContain('Target platform: Instagram');
  });
});

// ---------------------------------------------------------------------------
// SkillEntry contract
// ---------------------------------------------------------------------------

describe('rewriteForPlatformSkill', () => {
  it('has the expected id', () => {
    expect(rewriteForPlatformSkill.id).toBe('rewrite_for_platform');
  });

  it('has a description', () => {
    expect(rewriteForPlatformSkill.description).toContain('Rewrite');
    expect(rewriteForPlatformSkill.description.length).toBeGreaterThan(10);
  });

  it('handler is a function', () => {
    expect(typeof rewriteForPlatformSkill.handler).toBe('function');
  });

  it('handler delegates to handleRewrite', async () => {
    stubRewriteResult({ content: 'Skill handler draft' });

    const result = await rewriteForPlatformSkill.handler(makeCtx(), {
      draft: 'Original',
      targetPlatform: 'twitter',
    });

    expect(result.content).toBe('Skill handler draft');
    expect(result.platform).toBe('twitter');
  });
});
