jest.mock('../../agents/researcher', () => ({
  runResearcher: jest.fn(),
}));

import { createResearchTopicTool } from './research_topic';
import { runResearcher } from '../../agents/researcher';
import type { OrchestratorContext } from '../types';
import type { ResearcherOutput } from '../../agents/researcher';

const mockRunResearcher = runResearcher as jest.MockedFunction<typeof runResearcher>;

const NOW = new Date('2026-04-24T12:00:00Z');

function makeCtx(): { ctx: OrchestratorContext } {
  const ctx: OrchestratorContext = {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: NOW,
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
  return { ctx };
}

function makeResearchResult(overrides: Partial<ResearcherOutput> = {}): ResearcherOutput {
  return {
    findings: [
      { title: 'AI trends 2026', url: 'https://example.com/ai', content: 'AI is booming.', relevance: 0.9, source: 'tavily' },
      { title: 'ML advances', url: 'https://example.com/ml', content: 'New architectures.', relevance: 0.8, source: 'tavily' },
    ],
    summary: 'AI and ML are rapidly evolving in 2026, with new architectures and applications emerging.',
    query: 'AI trends',
    type: 'web_search',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('research_topic — successful search', () => {
  test('observation equals the researcher summary', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeResearchResult());
    const tool = createResearchTopicTool();

    const result = await tool.handler(ctx, { query: 'AI trends' });

    expect(result.observation).toBe(makeResearchResult().summary);
  });

  test('data reflects findings count and query', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeResearchResult());
    const tool = createResearchTopicTool();

    const result = await tool.handler(ctx, { query: 'AI trends' });

    expect(result.data?.query).toBe('AI trends');
    expect(result.data?.findingsCount).toBe(2);
    expect(result.data?.summary).toBeTruthy();
  });

  test('passes type=web_search to runResearcher', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeResearchResult());
    const tool = createResearchTopicTool();

    await tool.handler(ctx, { query: 'AI trends', depth: 'advanced', maxResults: 10 });

    expect(mockRunResearcher).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: expect.objectContaining({ id: 'org-1' }) }),
      { query: 'AI trends', type: 'web_search', depth: 'advanced', maxResults: 10 },
    );
  });

  test('does not emit any UI side-event', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeResearchResult());
    const tool = createResearchTopicTool();

    await tool.handler(ctx, { query: 'AI trends' });

    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('research_topic — search failure', () => {
  test('returns graceful error observation on API failure', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockRejectedValue(
      new Error('Tavily API key not configured — set AP_TAVILY_API_KEY'),
    );
    const tool = createResearchTopicTool();

    const result = await tool.handler(ctx, { query: 'AI trends' });

    expect(result.observation).toMatch(/Research failed/);
    expect(result.observation).toMatch(/AP_TAVILY_API_KEY/);
    expect(result.data?.findingsCount).toBe(0);
  });

  test('warns via logger on failure', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockRejectedValue(new Error('network timeout'));
    const tool = createResearchTopicTool();

    await tool.handler(ctx, { query: 'AI trends' });

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/research_topic.*AI trends.*network timeout/),
    );
  });
});

describe('research_topic — schema', () => {
  test('requires query', () => {
    const tool = createResearchTopicTool();
    expect(() => tool.parameters.parse({})).toThrow();
    expect(() => tool.parameters.parse({ query: 'AI trends' })).not.toThrow();
  });

  test('rejects maxResults out of range', () => {
    const tool = createResearchTopicTool();
    expect(() => tool.parameters.parse({ query: 'q', maxResults: 0 })).toThrow();
    expect(() => tool.parameters.parse({ query: 'q', maxResults: 21 })).toThrow();
    expect(() => tool.parameters.parse({ query: 'q', maxResults: 5 })).not.toThrow();
  });

  test('description mentions Tavily', () => {
    const tool = createResearchTopicTool();
    expect(tool.description).toMatch(/Tavily/);
  });
});
