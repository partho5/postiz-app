/**
 * Unit tests for the Researcher agent — slices 3.4 (Tavily) + 3.5 (Apify)
 *
 * External APIs (Tavily, Apify) and LLM (generateObject) are mocked.
 * getStructuredProfile is mocked for niche context.
 */

jest.mock('ai-v5');
jest.mock('../memory', () => ({
  ...jest.requireActual('../memory'),
  getStructuredProfile: jest.fn(),
}));

// Mock global fetch for Tavily and Apify API calls.
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { generateObject } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import * as memoryModule from '../memory';
import {
  runResearcher,
  researcherAgent,
  searchTavily,
  scrapeCompetitor,
  runApifyActor,
} from './researcher';
import type { ResearcherInput, ResearchFinding } from './researcher';
import type { AgentContext } from './types';
import type { LlmProvider } from '../skills/types';

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

function makeCtx(overrides?: Partial<AgentContext>): AgentContext {
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
    ...overrides,
  };
}

const MOCK_PROFILE: memoryModule.StructuredProfile = {
  businessProfile: {
    id: 'bp-1',
    niche: 'SaaS productivity tools',
    goals: ['grow audience'],
    brandVoiceShort: 'Friendly',
    brandVoiceExtended: 'Simple explanations',
    antiPatterns: [],
    regulatoryFlags: [],
    updatedAt: new Date(),
    updatedBy: 'user',
  },
  growthRules: [],
};

const MOCK_TAVILY_RESPONSE = {
  query: 'AI productivity tools 2026',
  results: [
    {
      title: 'Top AI Productivity Tools in 2026',
      url: 'https://example.com/ai-tools-2026',
      content: 'A comprehensive overview of the best AI productivity tools available in 2026...',
      score: 0.95,
    },
    {
      title: 'How AI is Changing Remote Work',
      url: 'https://example.com/ai-remote-work',
      content: 'AI-powered tools are transforming how remote teams collaborate...',
      score: 0.87,
    },
  ],
};

function stubFetchOk(responseBody: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  });
}

function stubFetchError(status: number, statusText: string, body?: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body ?? ''),
  });
}

function stubSummary(summary: string) {
  mockGenerateObject.mockResolvedValueOnce({
    object: { summary },
  } as any);
}

beforeEach(() => {
  jest.resetAllMocks();
  mockGetStructuredProfile.mockResolvedValue(MOCK_PROFILE);
  // Set API keys for tests.
  process.env.AP_TAVILY_API_KEY = 'test-tavily-key';
  process.env.AP_APIFY_API_KEY = 'test-apify-key';
});

afterEach(() => {
  delete process.env.AP_TAVILY_API_KEY;
  delete process.env.AP_APIFY_API_KEY;
  delete process.env.AP_APIFY_SCRAPER_ACTOR;
});

// ===========================================================================
// searchTavily (slice 3.4)
// ===========================================================================

describe('searchTavily', () => {
  it('returns findings from Tavily API', async () => {
    stubFetchOk(MOCK_TAVILY_RESPONSE);

    const results = await searchTavily('AI tools', 'basic', 5);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Top AI Productivity Tools in 2026');
    expect(results[0].url).toBe('https://example.com/ai-tools-2026');
    expect(results[0].relevance).toBe(0.95);
    expect(results[0].source).toBe('tavily');
  });

  it('sends correct request body to Tavily', async () => {
    stubFetchOk({ query: 'test', results: [] });

    await searchTavily('test query', 'advanced', 10);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody).toEqual({
      api_key: 'test-tavily-key',
      query: 'test query',
      search_depth: 'advanced',
      max_results: 10,
      include_answer: false,
      include_raw_content: false,
    });
  });

  it('clamps maxResults to [1, 20]', async () => {
    stubFetchOk({ query: 'test', results: [] });

    await searchTavily('test', 'basic', 100);

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.max_results).toBe(20);
  });

  it('throws when AP_TAVILY_API_KEY is not set', async () => {
    delete process.env.AP_TAVILY_API_KEY;

    await expect(searchTavily('test')).rejects.toThrow('AP_TAVILY_API_KEY');
  });

  it('throws on API error response', async () => {
    stubFetchError(429, 'Too Many Requests', 'Rate limit exceeded');

    await expect(searchTavily('test')).rejects.toThrow(
      'Tavily API error: 429',
    );
  });
});

// ===========================================================================
// runApifyActor (slice 3.5)
// ===========================================================================

describe('runApifyActor', () => {
  it('starts actor, polls for completion, and returns dataset items', async () => {
    // 1. Start run response.
    stubFetchOk({
      data: { id: 'run-123', status: 'RUNNING', defaultDatasetId: 'ds-456' },
    });
    // 2. Poll — still running.
    stubFetchOk({
      data: { id: 'run-123', status: 'RUNNING', defaultDatasetId: 'ds-456' },
    });
    // 3. Poll — succeeded.
    stubFetchOk({
      data: {
        id: 'run-123',
        status: 'SUCCEEDED',
        defaultDatasetId: 'ds-456',
      },
    });
    // 4. Dataset items.
    stubFetchOk([
      { title: 'Page 1', url: 'https://example.com/1', text: 'Content 1' },
      { title: 'Page 2', url: 'https://example.com/2', text: 'Content 2' },
    ]);

    const items = await runApifyActor('test/actor', { input: 'value' }, 10);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({ title: 'Page 1', url: 'https://example.com/1' }),
    );
  });

  it('throws when AP_APIFY_API_KEY is not set', async () => {
    delete process.env.AP_APIFY_API_KEY;

    await expect(
      runApifyActor('test/actor', {}),
    ).rejects.toThrow('AP_APIFY_API_KEY');
  });

  it('throws when actor run fails', async () => {
    stubFetchOk({
      data: { id: 'run-123', status: 'RUNNING', defaultDatasetId: 'ds-456' },
    });
    stubFetchOk({
      data: { id: 'run-123', status: 'FAILED', defaultDatasetId: 'ds-456' },
    });

    await expect(
      runApifyActor('test/actor', {}),
    ).rejects.toThrow('FAILED');
  });

  it('throws on actor start API error', async () => {
    stubFetchError(500, 'Internal Server Error');

    await expect(
      runApifyActor('test/actor', {}),
    ).rejects.toThrow('Apify actor start failed: 500');
  });
});

// ===========================================================================
// scrapeCompetitor (slice 3.5)
// ===========================================================================

describe('scrapeCompetitor', () => {
  /** Stub the 3-step Apify flow: start run → status poll (SUCCEEDED) → dataset items. */
  function stubApifyRun(items: Record<string, unknown>[]) {
    stubFetchOk({
      data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' },
    });
    stubFetchOk({
      data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' },
    });
    stubFetchOk(items);
  }

  it('builds correct URLs for known platforms', async () => {
    stubApifyRun([
      {
        title: 'Competitor Profile',
        url: 'https://x.com/competitor',
        text: 'Bio and recent posts...',
      },
    ]);

    const findings = await scrapeCompetitor('@competitor', ['twitter'], 5);

    // Verify the actor was called with the right URL.
    const startBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(startBody.startUrls).toEqual([
      { url: 'https://x.com/competitor' },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].source).toBe('apify');
    expect(findings[0].title).toBe('Competitor Profile');
  });

  it('handles multiple platforms', async () => {
    stubApifyRun([
      { title: 'Twitter Profile', url: 'https://x.com/user', text: 'Tweets' },
      { title: 'Instagram Profile', url: 'https://www.instagram.com/user', text: 'Posts' },
    ]);

    const findings = await scrapeCompetitor(
      'user',
      ['twitter', 'instagram'],
      3,
    );

    const startBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(startBody.startUrls).toHaveLength(2);
    expect(findings).toHaveLength(2);
  });

  it('returns empty array for unknown platforms', async () => {
    const findings = await scrapeCompetitor('user', ['myspace'], 5);

    expect(findings).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('truncates content to 2000 chars', async () => {
    const longText = 'x'.repeat(5000);
    stubApifyRun([{ title: 'Long', url: 'https://example.com', text: longText }]);

    const findings = await scrapeCompetitor('user', ['twitter'], 1);

    expect(findings[0].content.length).toBe(2000);
  });

  it('uses custom actor from env var', async () => {
    process.env.AP_APIFY_SCRAPER_ACTOR = 'custom/scraper';
    stubApifyRun([]);

    await scrapeCompetitor('user', ['twitter'], 1);

    expect(mockFetch.mock.calls[0][0]).toContain('custom/scraper');
  });
});

// ===========================================================================
// runResearcher — web_search (slice 3.4)
// ===========================================================================

describe('runResearcher — web_search', () => {
  it('performs web search and returns findings with summary', async () => {
    stubFetchOk(MOCK_TAVILY_RESPONSE);
    stubSummary(
      'AI productivity tools are rapidly evolving with key trends in automation and collaboration.',
    );

    const result = await runResearcher(makeCtx(), {
      query: 'AI productivity tools 2026',
    });

    expect(result.type).toBe('web_search');
    expect(result.query).toBe('AI productivity tools 2026');
    expect(result.findings).toHaveLength(2);
    expect(result.summary).toContain('AI productivity tools');
  });

  it('defaults to web_search when type is omitted', async () => {
    stubFetchOk({ query: 'test', results: [] });
    // No stubSummary needed — generateSummary returns early for empty findings.

    const result = await runResearcher(makeCtx(), { query: 'test' });

    expect(result.type).toBe('web_search');
  });

  it('defaults to basic depth', async () => {
    stubFetchOk({ query: 'test', results: [] });

    await runResearcher(makeCtx(), { query: 'test' });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.search_depth).toBe('basic');
  });

  it('uses advanced depth when specified', async () => {
    stubFetchOk({ query: 'test', results: [] });

    await runResearcher(makeCtx(), {
      query: 'test',
      depth: 'advanced',
    });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.search_depth).toBe('advanced');
  });

  it('clamps maxResults to [1, 20]', async () => {
    stubFetchOk({ query: 'test', results: [] });

    await runResearcher(makeCtx(), { query: 'test', maxResults: 50 });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.max_results).toBe(20);
  });

  it('falls back to generic summary when LLM fails', async () => {
    stubFetchOk(MOCK_TAVILY_RESPONSE);
    mockGenerateObject.mockRejectedValueOnce(new Error('LLM down'));

    const result = await runResearcher(makeCtx(), {
      query: 'AI tools',
    });

    expect(result.summary).toContain('2 result(s)');
    expect(result.findings).toHaveLength(2);
  });

  it('returns "no findings" summary when results are empty', async () => {
    stubFetchOk({ query: 'test', results: [] });
    // No stubSummary — generateSummary returns early for empty findings.

    const result = await runResearcher(makeCtx(), { query: 'niche topic' });

    expect(result.findings).toHaveLength(0);
    expect(result.summary).toContain('No findings');
  });
});

// ===========================================================================
// runResearcher — competitor_scrape (slice 3.5)
// ===========================================================================

describe('runResearcher — competitor_scrape', () => {
  /** Stub 3-step Apify flow for runResearcher tests. */
  function stubApifyRunForResearcher(items: Record<string, unknown>[]) {
    // 1. Start run.
    stubFetchOk({
      data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' },
    });
    // 2. Status poll → SUCCEEDED.
    stubFetchOk({
      data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' },
    });
    // 3. Dataset items.
    stubFetchOk(items);
  }

  it('performs competitor scrape when type is competitor_scrape', async () => {
    stubApifyRunForResearcher([
      { title: 'Competitor', url: 'https://x.com/rival', text: 'Their content strategy...' },
    ]);
    stubSummary('The competitor focuses on engagement-driven content.');

    const result = await runResearcher(makeCtx(), {
      query: 'competitor analysis',
      type: 'competitor_scrape',
      handle: '@rival',
      platforms: ['twitter'],
    });

    expect(result.type).toBe('competitor_scrape');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('apify');
    expect(result.summary).toContain('competitor');
  });

  it('throws when handle is missing for competitor_scrape', async () => {
    await expect(
      runResearcher(makeCtx(), {
        query: 'competitor analysis',
        type: 'competitor_scrape',
      }),
    ).rejects.toThrow('handle');
  });

  it('defaults to twitter when no platforms specified for competitor_scrape', async () => {
    stubApifyRunForResearcher([
      { title: 'Profile', url: 'https://x.com/user', text: 'Content' },
    ]);
    stubSummary('Summary');

    const result = await runResearcher(makeCtx(), {
      query: 'analysis',
      type: 'competitor_scrape',
      handle: 'user',
    });

    const startBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(startBody.startUrls).toEqual([{ url: 'https://x.com/user' }]);
    expect(result.findings).toHaveLength(1);
  });
});

// ===========================================================================
// Profile context in summary
// ===========================================================================

describe('runResearcher — profile context', () => {
  it('includes niche context in summary prompt when profile exists', async () => {
    stubFetchOk(MOCK_TAVILY_RESPONSE);
    stubSummary('Niche-aware summary');

    await runResearcher(makeCtx(), { query: 'AI tools' });

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain('SaaS productivity tools');
  });

  it('generates summary without profile when profile is missing', async () => {
    mockGetStructuredProfile.mockRejectedValueOnce(new Error('no profile'));
    stubFetchOk(MOCK_TAVILY_RESPONSE);
    stubSummary('Generic summary');

    const result = await runResearcher(makeCtx(), { query: 'AI tools' });

    expect(result.summary).toBe('Generic summary');
    const systemPrompt = mockGenerateObject.mock.calls[0][0].system as string;
    expect(systemPrompt).not.toContain('SaaS productivity');
  });
});

// ===========================================================================
// AgentDefinition contract
// ===========================================================================

describe('researcherAgent', () => {
  it('has the expected id', () => {
    expect(researcherAgent.id).toBe('researcher');
  });

  it('has a system prompt', () => {
    expect(researcherAgent.systemPrompt).toContain('research');
  });

  it('declares no allowed skills', () => {
    expect(researcherAgent.allowedSkills).toHaveLength(0);
  });

  it('run() delegates to runResearcher', async () => {
    stubFetchOk(MOCK_TAVILY_RESPONSE);
    stubSummary('Agent run summary');

    const result = await researcherAgent.run(makeCtx(), {
      query: 'test topic',
    });

    expect(result.query).toBe('test topic');
    expect(result.findings).toHaveLength(2);
  });
});
