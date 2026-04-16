/**
 * Unit tests for intent parser agent — slice 1.3
 *
 * generateObject is mocked so tests are deterministic and require no API key.
 */

jest.mock('ai-v5');

import { generateObject } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import { parseIntent, intentParserAgent } from './intent_parser';
import type { LlmProvider } from '../skills/types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockGenerateObject = generateObject as jest.MockedFunction<
  typeof generateObject
>;

const fakeLlm: LlmProvider = {
  model: {} as LanguageModel,
  complete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Classification buckets
// ---------------------------------------------------------------------------

describe('parseIntent — intent classification', () => {
  it('classifies direct_action', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'direct_action' },
    } as any);

    const result = await parseIntent('Post to LinkedIn now', fakeLlm);

    expect(result.intent).toBe('direct_action');
    expect(result.draft).toBeUndefined();
  });

  it('classifies config_change_request and returns a populated draft', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        intent: 'config_change_request',
        targetEntity: 'business_profile',
        targetId: null,
        changes: { niche: 'SaaS' },
        rationale: 'User mentioned they sell SaaS products.',
      },
    } as any);

    const result = await parseIntent('We are a SaaS company', fakeLlm);

    expect(result.intent).toBe('config_change_request');
    expect(result.draft).toBeDefined();
    expect(result.draft!.targetEntity).toBe('business_profile');
    expect(result.draft!.targetId).toBeNull();
    expect(result.draft!.changes).toEqual({ niche: 'SaaS' });
    expect(result.draft!.rationale).toBe('User mentioned they sell SaaS products.');
  });

  it('classifies question', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'question' },
    } as any);

    const result = await parseIntent('How many posts went out this week?', fakeLlm);

    expect(result.intent).toBe('question');
    expect(result.draft).toBeUndefined();
  });

  it('classifies small_talk', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'small_talk' },
    } as any);

    const result = await parseIntent('Thanks!', fakeLlm);

    expect(result.intent).toBe('small_talk');
    expect(result.draft).toBeUndefined();
  });

  it('classifies unclear', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'unclear' },
    } as any);

    const result = await parseIntent('???', fakeLlm);

    expect(result.intent).toBe('unclear');
    expect(result.draft).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tenant context and fallback defaults
// ---------------------------------------------------------------------------

describe('parseIntent — tenant context', () => {
  it('injects niche into system prompt when tenantContext is provided', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'small_talk' },
    } as any);

    await parseIntent('hi', fakeLlm, { niche: 'E-commerce', goals: ['grow revenue'] });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('E-commerce'),
      }),
    );
  });

  it('omits tenant context section when tenantContext is absent', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'small_talk' },
    } as any);

    await parseIntent('hi', fakeLlm);

    const call = mockGenerateObject.mock.calls[0][0] as any;
    expect(call.system).not.toContain('Tenant context');
  });
});

describe('parseIntent — draft defaults', () => {
  it('uses safe fallbacks when config_change_request omits optional fields', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'config_change_request' },
    } as any);

    const result = await parseIntent('change something', fakeLlm);

    expect(result.draft).toBeDefined();
    expect(result.draft!.targetEntity).toBe('business_profile');
    expect(result.draft!.targetId).toBeNull();
    expect(result.draft!.changes).toEqual({});
    expect(result.draft!.rationale).toBe('');
  });

  it('preserves non-null targetId from LLM output', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        intent: 'config_change_request',
        targetEntity: 'growth_rule',
        targetId: 'rule-abc',
        changes: { active: false },
        rationale: 'Disable outdated rule.',
      },
    } as any);

    const result = await parseIntent('disable that old rule', fakeLlm);

    expect(result.draft!.targetId).toBe('rule-abc');
    expect(result.draft!.targetEntity).toBe('growth_rule');
  });
});

// ---------------------------------------------------------------------------
// AgentDefinition contract
// ---------------------------------------------------------------------------

describe('intentParserAgent', () => {
  it('has the expected id', () => {
    expect(intentParserAgent.id).toBe('intent_parser');
  });

  it('declares no allowed skills (pure classification, no skill dispatch)', () => {
    expect(intentParserAgent.allowedSkills).toHaveLength(0);
  });

  it('run() delegates to parseIntent', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'question' },
    } as any);

    const ctx = { llm: fakeLlm } as any;
    const result = await intentParserAgent.run(ctx, { message: 'how many posts?' });

    expect(result.intent).toBe('question');
  });

  it('run() passes tenantContext when provided in input', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { intent: 'small_talk' },
    } as any);

    const ctx = { llm: fakeLlm } as any;
    await intentParserAgent.run(ctx, {
      message: 'hi',
      tenantContext: { niche: 'Fintech' },
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Fintech'),
      }),
    );
  });
});
