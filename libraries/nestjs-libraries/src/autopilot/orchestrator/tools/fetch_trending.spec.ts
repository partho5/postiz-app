import { createFetchTrendingTool } from './fetch_trending';
import type { OrchestratorContext } from '../types';

jest.mock('ai-v5', () => ({ generateObject: jest.fn() }));
jest.mock('../../memory', () => ({ getStructuredProfile: jest.fn() }));
jest.mock('../../agents/researcher', () => ({ searchTavily: jest.fn() }));

import { generateObject } from 'ai-v5';
import { getStructuredProfile } from '../../memory';
import { searchTavily } from '../../agents/researcher';

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

const TAVILY_RESULTS = [
  { title: 'AI in SaaS 2026', content: 'AI is transforming SaaS workflows rapidly this year.' },
  { title: 'SaaS pricing trends', content: 'Usage-based pricing is now the dominant model in SaaS.' },
  { title: 'Customer success at scale', content: 'CS teams are investing heavily in automation.' },
  { title: 'PLG motion', content: 'Product-led growth continues to dominate the SaaS landscape.' },
  { title: 'API-first architectures', content: 'More companies are adopting API-first development.' },
];

describe('fetch_trending', () => {
  const tool = createFetchTrendingTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('fetch_trending');
    expect(tool.description).toContain('trending');
  });

  it('returns topics from Tavily when available', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS);

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { niche: 'SaaS', count: 5 });

    expect(result.data!.source).toBe('tavily');
    expect(result.data!.topics).toHaveLength(5);
    expect(result.data!.topics[0].source).toBe('tavily');
    expect(result.observation).toContain('AI in SaaS 2026');
  });

  it('falls back to LLM when Tavily throws', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockRejectedValue(new Error('AP_TAVILY_API_KEY not set'));
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        topics: [
          { topic: 'AI governance', relevance: 'Growing regulatory attention.' },
          { topic: 'Green SaaS', relevance: 'Sustainability is becoming a differentiator.' },
        ],
      },
    });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { niche: 'SaaS', count: 2 });

    expect(result.data!.source).toBe('llm_fallback');
    expect(result.data!.topics[0].source).toBe('llm');
    expect(result.observation).toContain('AP_TAVILY_API_KEY');
  });

  it('loads niche from profile when not provided in input', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { niche: 'FinTech', goals: [], brandVoiceShort: 'professional' },
      growthRules: [],
    });
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS.slice(0, 3));

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {});

    expect(result.data!.niche).toBe('FinTech');
    const tavilyCall = (searchTavily as jest.Mock).mock.calls[0];
    expect(tavilyCall[0]).toContain('FinTech');
  });

  it('defaults niche to "general business" when no profile and no input', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS.slice(0, 2));

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {});

    expect(result.data!.niche).toBe('general business');
  });

  it('appends platform to Tavily query when provided', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS.slice(0, 2));

    const ctx = makeCtx();
    await tool.handler(ctx, { niche: 'SaaS', platform: 'linkedin', count: 2 });

    const query = (searchTavily as jest.Mock).mock.calls[0][0];
    expect(query).toContain('linkedin');
  });

  it('caps topics to requested count', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS);

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { niche: 'SaaS', count: 3 });

    expect(result.data!.topics).toHaveLength(3);
  });

  it('does not emit an SSE event', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS.slice(0, 2));

    const ctx = makeCtx();
    await tool.handler(ctx, { niche: 'SaaS', count: 2 });

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('defaults count to 5', async () => {
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (searchTavily as jest.Mock).mockResolvedValue(TAVILY_RESULTS);

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { niche: 'SaaS' });

    expect(result.data!.topics).toHaveLength(5);
  });
});
