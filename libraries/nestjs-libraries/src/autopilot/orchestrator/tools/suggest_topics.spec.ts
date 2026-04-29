import { createSuggestTopicsTool } from './suggest_topics';
import type { OrchestratorContext } from '../types';

jest.mock('ai-v5', () => ({ generateObject: jest.fn() }));
jest.mock('../../memory', () => ({ getStructuredProfile: jest.fn() }));

import { generateObject } from 'ai-v5';
import { getStructuredProfile } from '../../memory';

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

const MOCK_TOPICS = [
  { topic: 'Topic A', rationale: 'Reason A', suggestedFormat: 'short post' },
  { topic: 'Topic B', rationale: 'Reason B', suggestedFormat: 'thread' },
  { topic: 'Topic C', rationale: 'Reason C' },
];

describe('suggest_topics', () => {
  const tool = createSuggestTopicsTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('suggest_topics');
    expect(tool.description).toContain('topic');
    expect(tool.description.toLowerCase()).toContain('pure read');
  });

  it('returns topic ideas from LLM', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { niche: 'SaaS', goals: ['growth'], brandVoiceShort: 'professional' },
      growthRules: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: MOCK_TOPICS } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { count: 3 });

    expect(result.data!.topics).toHaveLength(3);
    expect(result.data!.topics[0].topic).toBe('Topic A');
    expect(result.observation).toContain('Topic A');
  });

  it('defaults count to 5', async () => {
    const fiveTopics = Array.from({ length: 5 }, (_, i) => ({
      topic: `T${i}`,
      rationale: `R${i}`,
    }));
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: fiveTopics } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {});

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.prompt).toContain('5');
    expect(result.data!.count).toBe(5);
  });

  it('includes niche and goals from profile in system prompt', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { niche: 'FinTech', goals: ['retention'], brandVoiceShort: 'trustworthy' },
      growthRules: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: [MOCK_TOPICS[0]] } });

    const ctx = makeCtx();
    await tool.handler(ctx, { count: 1 });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('FinTech');
    expect(callArgs.system).toContain('trustworthy');
  });

  it('uses generic prompt when no profile exists', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: [MOCK_TOPICS[0]] } });

    const ctx = makeCtx();
    await tool.handler(ctx, { count: 1 });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('broadly useful');
  });

  it('includes platform hint when provided', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: [MOCK_TOPICS[0]] } });

    const ctx = makeCtx();
    await tool.handler(ctx, { count: 1, platform: 'linkedin' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('linkedin');
  });

  it('includes theme hint when provided', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: [MOCK_TOPICS[0]] } });

    const ctx = makeCtx();
    await tool.handler(ctx, { count: 1, theme: 'AI in marketing' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('AI in marketing');
  });

  it('does not emit an SSE event', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: [MOCK_TOPICS[0]] } });

    const ctx = makeCtx();
    await tool.handler(ctx, { count: 1 });

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('caps returned topics to requested count', async () => {
    const manyTopics = Array.from({ length: 10 }, (_, i) => ({
      topic: `T${i}`,
      rationale: `R${i}`,
    }));
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { topics: manyTopics } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { count: 3 });

    expect(result.data!.topics).toHaveLength(3);
  });
});
