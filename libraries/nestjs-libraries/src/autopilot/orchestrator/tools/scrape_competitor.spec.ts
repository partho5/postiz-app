jest.mock('../../agents/researcher', () => ({
  runResearcher: jest.fn(),
}));

import { createScrapeCompetitorTool } from './scrape_competitor';
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

function makeScrapeResult(overrides: Partial<ResearcherOutput> = {}): ResearcherOutput {
  return {
    findings: [
      { title: 'HubSpot tweet', url: 'https://x.com/HubSpot/status/1', content: 'Marketing tips...', relevance: 1.0, source: 'apify' },
    ],
    summary: 'HubSpot focuses on inbound marketing content and thought leadership on Twitter.',
    query: 'hubspot',
    type: 'competitor_scrape',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('scrape_competitor — successful scrape', () => {
  test('observation equals the researcher summary', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeScrapeResult());
    const tool = createScrapeCompetitorTool();

    const result = await tool.handler(ctx, { handle: 'hubspot' });

    expect(result.observation).toBe(makeScrapeResult().summary);
  });

  test('data reflects handle, platforms, and findings count', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeScrapeResult());
    const tool = createScrapeCompetitorTool();

    const result = await tool.handler(ctx, {
      handle: 'hubspot',
      platforms: ['twitter', 'linkedin'],
    });

    expect(result.data?.handle).toBe('hubspot');
    expect(result.data?.platforms).toEqual(['twitter', 'linkedin']);
    expect(result.data?.findingsCount).toBe(1);
  });

  test('defaults to ["twitter"] when platforms not specified', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeScrapeResult());
    const tool = createScrapeCompetitorTool();

    const result = await tool.handler(ctx, { handle: '@techcrunch' });

    expect(result.data?.platforms).toEqual(['twitter']);
    expect(mockRunResearcher).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ platforms: ['twitter'] }),
    );
  });

  test('passes type=competitor_scrape to runResearcher', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeScrapeResult());
    const tool = createScrapeCompetitorTool();

    await tool.handler(ctx, { handle: 'hubspot', platforms: ['linkedin'], maxResults: 3 });

    expect(mockRunResearcher).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: expect.objectContaining({ id: 'org-1' }) }),
      {
        query: 'hubspot',
        type: 'competitor_scrape',
        handle: 'hubspot',
        platforms: ['linkedin'],
        maxResults: 3,
      },
    );
  });

  test('does not emit any UI side-event', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockResolvedValue(makeScrapeResult());
    const tool = createScrapeCompetitorTool();

    await tool.handler(ctx, { handle: 'hubspot' });

    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('scrape_competitor — scrape failure', () => {
  test('returns graceful error observation on API failure', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockRejectedValue(
      new Error('Apify API key not configured — set AP_APIFY_API_KEY'),
    );
    const tool = createScrapeCompetitorTool();

    const result = await tool.handler(ctx, { handle: 'hubspot' });

    expect(result.observation).toMatch(/Competitor scrape failed/);
    expect(result.observation).toMatch(/AP_APIFY_API_KEY/);
    expect(result.data?.findingsCount).toBe(0);
    expect(result.data?.handle).toBe('hubspot');
  });

  test('warns via logger on failure', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockRejectedValue(new Error('actor timed out'));
    const tool = createScrapeCompetitorTool();

    await tool.handler(ctx, { handle: '@competitor' });

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/scrape_competitor.*@competitor.*actor timed out/),
    );
  });

  test('preserves platforms in error data', async () => {
    const { ctx } = makeCtx();
    mockRunResearcher.mockRejectedValue(new Error('timeout'));
    const tool = createScrapeCompetitorTool();

    const result = await tool.handler(ctx, {
      handle: 'stripe',
      platforms: ['twitter', 'linkedin'],
    });

    expect(result.data?.platforms).toEqual(['twitter', 'linkedin']);
  });
});

describe('scrape_competitor — schema', () => {
  test('requires handle', () => {
    const tool = createScrapeCompetitorTool();
    expect(() => tool.parameters.parse({})).toThrow();
    expect(() => tool.parameters.parse({ handle: 'hubspot' })).not.toThrow();
  });

  test('rejects maxResults out of range', () => {
    const tool = createScrapeCompetitorTool();
    expect(() => tool.parameters.parse({ handle: 'h', maxResults: 0 })).toThrow();
    expect(() => tool.parameters.parse({ handle: 'h', maxResults: 21 })).toThrow();
    expect(() => tool.parameters.parse({ handle: 'h', maxResults: 5 })).not.toThrow();
  });

  test('description mentions Apify', () => {
    const tool = createScrapeCompetitorTool();
    expect(tool.description).toMatch(/Apify/);
  });
});
