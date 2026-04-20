/**
 * Researcher agent — slices 3.4 (Tavily) + 3.5 (Apify)
 *
 * Performs web search and structured scraping to gather information about
 * topics, competitors, trends, and news.  Results are returned as structured
 * findings that can be stored in vector memory by the memorist agent.
 *
 * Two backends:
 *   - **Tavily** (slice 3.4) — web search for topics, news, trends.
 *     Requires `AP_TAVILY_API_KEY`.
 *   - **Apify** (slice 3.5) — structured scraping for competitor analysis.
 *     Requires `AP_APIFY_API_KEY`.
 *
 * Dependencies (verified against actual source files):
 *   AgentDefinition, AgentContext         — agents/types.ts
 *   getStructuredProfile(db, tenantId)    — memory/index.ts
 *   generateObject                        — ai-v5
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile, type StructuredProfile } from '../memory';
import type { AgentDefinition, AgentContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearcherInput {
  /** The research query or topic. */
  query: string;
  /** Research type: web search (Tavily) or competitor scrape (Apify). */
  type?: 'web_search' | 'competitor_scrape';
  /** Search depth: 'basic' for quick lookups, 'advanced' for thorough research. */
  depth?: 'basic' | 'advanced';
  /** Maximum number of results to return. Defaults to 5. */
  maxResults?: number;
  /** For competitor_scrape: the social media handle or URL to research. */
  handle?: string;
  /** For competitor_scrape: platforms to scrape (e.g. ['twitter', 'instagram']). */
  platforms?: string[];
}

export interface ResearchFinding {
  /** Title or headline of the finding. */
  title: string;
  /** Source URL. */
  url: string;
  /** Extracted content / summary. */
  content: string;
  /** Relevance score [0, 1]. */
  relevance: number;
  /** Which backend produced this finding. */
  source: 'tavily' | 'apify';
}

export interface ResearcherOutput {
  /** List of research findings, ordered by relevance. */
  findings: ResearchFinding[];
  /** LLM-generated summary of the findings in the context of the tenant's niche. */
  summary: string;
  /** The original query. */
  query: string;
  /** Which research type was used. */
  type: 'web_search' | 'competitor_scrape';
}

// ---------------------------------------------------------------------------
// Tavily API types (slice 3.4)
// ---------------------------------------------------------------------------

interface TavilySearchRequest {
  api_key: string;
  query: string;
  search_depth?: 'basic' | 'advanced';
  max_results?: number;
  include_answer?: boolean;
  include_raw_content?: boolean;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
}

interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
}

// ---------------------------------------------------------------------------
// Apify API types (slice 3.5)
// ---------------------------------------------------------------------------

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

interface ApifyRunStatusResponse {
  data: {
    id: string;
    status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED-OUT' | 'ABORTED';
    defaultDatasetId: string;
  };
}

/** Default actor for generic web content crawling. */
const DEFAULT_APIFY_ACTOR = 'apify/website-content-crawler';

/** Maximum time to wait for an Apify actor run (ms). */
const APIFY_RUN_TIMEOUT_MS = 120_000;

/** Polling interval for Apify actor run status (ms). */
const APIFY_POLL_INTERVAL_MS = 3_000;

/**
 * Platform-specific URL templates for building competitor profile URLs.
 * Used by scrapeCompetitor to construct crawl targets.
 */
const COMPETITOR_URL_TEMPLATES: Record<string, (handle: string) => string> = {
  twitter: (h) => `https://x.com/${h.replace(/^@/, '')}`,
  linkedin: (h) => h.startsWith('http') ? h : `https://www.linkedin.com/in/${h}`,
  instagram: (h) => `https://www.instagram.com/${h.replace(/^@/, '')}`,
  facebook: (h) => h.startsWith('http') ? h : `https://www.facebook.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h.replace(/^@/, '')}`,
  youtube: (h) => h.startsWith('http') ? h : `https://www.youtube.com/@${h.replace(/^@/, '')}`,
  threads: (h) => `https://www.threads.net/@${h.replace(/^@/, '')}`,
};

// ---------------------------------------------------------------------------
// Tavily search (slice 3.4)
// ---------------------------------------------------------------------------

/**
 * Search the web via Tavily API.
 * Returns structured findings with title, URL, content, and relevance score.
 *
 * @throws Error if AP_TAVILY_API_KEY is not set or API call fails.
 */
export async function searchTavily(
  query: string,
  depth: 'basic' | 'advanced' = 'basic',
  maxResults: number = 5,
): Promise<ResearchFinding[]> {
  const apiKey = process.env.AP_TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Tavily API key not configured — set AP_TAVILY_API_KEY to enable web search.',
    );
  }

  const body: TavilySearchRequest = {
    api_key: apiKey,
    query,
    search_depth: depth,
    max_results: Math.max(1, Math.min(maxResults, 20)),
    include_answer: false,
    include_raw_content: false,
  };

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Tavily API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
    );
  }

  const data: TavilySearchResponse = await response.json();

  return data.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    relevance: r.score,
    source: 'tavily' as const,
  }));
}

// ---------------------------------------------------------------------------
// Apify actor runner (slice 3.5)
// ---------------------------------------------------------------------------

/**
 * Run an Apify actor and collect the results from its default dataset.
 *
 * @param actorId    Actor ID (e.g. 'apify/website-content-crawler').
 * @param input      Actor-specific input object.
 * @param maxItems   Maximum dataset items to fetch.
 * @returns Array of dataset items (shape depends on the actor).
 * @throws Error if AP_APIFY_API_KEY is not set, actor fails, or times out.
 */
export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  maxItems: number = 10,
): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.AP_APIFY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Apify API key not configured — set AP_APIFY_API_KEY to enable structured scraping.',
    );
  }

  const baseUrl = 'https://api.apify.com/v2';

  // 1. Start the actor run.
  const runResponse = await fetch(
    `${baseUrl}/acts/${actorId}/runs?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (!runResponse.ok) {
    const text = await runResponse.text().catch(() => '');
    throw new Error(
      `Apify actor start failed: ${runResponse.status} ${runResponse.statusText}${text ? ` — ${text}` : ''}`,
    );
  }

  const runData: ApifyRunResponse = await runResponse.json();
  const runId = runData.data.id;

  // 2. Poll until the run completes or times out.
  const deadline = Date.now() + APIFY_RUN_TIMEOUT_MS;
  let datasetId: string | undefined;

  while (Date.now() < deadline) {
    const statusResponse = await fetch(
      `${baseUrl}/actor-runs/${runId}?token=${apiKey}`,
    );

    if (!statusResponse.ok) {
      throw new Error(
        `Apify status check failed: ${statusResponse.status}`,
      );
    }

    const statusData: ApifyRunStatusResponse = await statusResponse.json();
    const { status } = statusData.data;

    if (status === 'SUCCEEDED') {
      datasetId = statusData.data.defaultDatasetId;
      break;
    }

    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
      throw new Error(`Apify actor run ${status}: ${runId}`);
    }

    // Still running — wait before next poll.
    await new Promise((resolve) => setTimeout(resolve, APIFY_POLL_INTERVAL_MS));
  }

  if (!datasetId) {
    throw new Error(
      `Apify actor run timed out after ${APIFY_RUN_TIMEOUT_MS / 1000}s: ${runId}`,
    );
  }

  // 3. Fetch dataset items.
  const datasetResponse = await fetch(
    `${baseUrl}/datasets/${datasetId}/items?token=${apiKey}&limit=${maxItems}`,
  );

  if (!datasetResponse.ok) {
    throw new Error(
      `Apify dataset fetch failed: ${datasetResponse.status}`,
    );
  }

  return datasetResponse.json();
}

/**
 * Scrape competitor profiles across specified platforms using Apify.
 * Constructs profile URLs from the handle and platform list, then crawls
 * them using the web content crawler actor.
 *
 * @param handle     Social media handle or URL of the competitor.
 * @param platforms  Platforms to scrape (e.g. ['twitter', 'instagram']).
 * @param maxItems   Maximum items per platform.
 * @returns Structured findings from the crawled content.
 */
export async function scrapeCompetitor(
  handle: string,
  platforms: string[],
  maxItems: number = 5,
): Promise<ResearchFinding[]> {
  // Build URLs for each platform.
  const urls: string[] = [];
  for (const platform of platforms) {
    const template = COMPETITOR_URL_TEMPLATES[platform.toLowerCase()];
    if (template) {
      urls.push(template(handle));
    }
  }

  if (urls.length === 0) {
    return [];
  }

  const actorId = process.env.AP_APIFY_SCRAPER_ACTOR ?? DEFAULT_APIFY_ACTOR;

  const items = await runApifyActor(
    actorId,
    {
      startUrls: urls.map((url) => ({ url })),
      maxCrawlPages: maxItems * urls.length,
      maxCrawlDepth: 1,
    },
    maxItems * urls.length,
  );

  return items.map((item, idx) => ({
    title: String(item.title ?? item.name ?? `Result ${idx + 1}`),
    url: String(item.url ?? item.loadedUrl ?? ''),
    content: String(
      item.text ?? item.description ?? item.markdown ?? JSON.stringify(item),
    ).slice(0, 2000),
    relevance: 1 - idx * 0.05, // Decreasing relevance by order
    source: 'apify' as const,
  }));
}

// ---------------------------------------------------------------------------
// Zod schema for LLM-generated summary
// ---------------------------------------------------------------------------

const summarySchema = z.object({
  summary: z
    .string()
    .describe(
      'A concise summary of the research findings, highlighting key insights and actionable takeaways relevant to the business.',
    ),
});

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

async function generateSummary(
  ctx: AgentContext,
  query: string,
  findings: ResearchFinding[],
  profile: StructuredProfile | null,
): Promise<string> {
  if (findings.length === 0) {
    return 'No findings were returned for this query.';
  }

  const lines: string[] = [
    'Summarize the following research findings for a social media autopilot user.',
  ];

  if (profile?.businessProfile?.niche) {
    lines.push(`The user's niche is: ${profile.businessProfile.niche}.`);
  }

  lines.push(
    'Focus on actionable insights, trends, and opportunities. Be concise but specific.',
    'Do not just list the findings — synthesize them into a coherent narrative.',
  );

  const findingsText = findings
    .map(
      (f, i) =>
        `[${i + 1}] ${f.title}\n    URL: ${f.url}\n    ${f.content.slice(0, 500)}`,
    )
    .join('\n\n');

  const { object } = await generateObject({
    model: ctx.llm.model,
    schema: summarySchema,
    prompt: `Research query: "${query}"\n\nFindings:\n${findingsText}`,
    system: lines.join('\n'),
  });

  return object.summary;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Run the researcher agent: perform a web search or competitor scrape,
 * then generate an LLM-synthesized summary of the findings.
 */
export async function runResearcher(
  ctx: AgentContext,
  input: ResearcherInput,
): Promise<ResearcherOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;
  const researchType = input.type ?? 'web_search';
  const depth = input.depth ?? 'basic';
  const maxResults = Math.max(1, Math.min(input.maxResults ?? 5, 20));

  // 1. Load profile for niche context in summary.
  let profile: StructuredProfile | null = null;
  try {
    profile = await getStructuredProfile(db, tenantId);
  } catch {
    // Profile missing — summary will be generic.
  }

  // 2. Perform the research.
  let findings: ResearchFinding[];

  if (researchType === 'competitor_scrape') {
    if (!input.handle) {
      throw new Error(
        'competitor_scrape requires a handle — specify the social media handle or URL to research.',
      );
    }
    const platforms = input.platforms ?? ['twitter'];
    findings = await scrapeCompetitor(input.handle, platforms, maxResults);
  } else {
    findings = await searchTavily(input.query, depth, maxResults);
  }

  // 3. Generate an LLM summary of findings.
  let summary: string;
  try {
    summary = await generateSummary(ctx, input.query, findings, profile);
  } catch {
    // LLM summarization failed — return findings without summary.
    summary = findings.length > 0
      ? `Found ${findings.length} result(s) for "${input.query}".`
      : `No results found for "${input.query}".`;
  }

  return {
    findings,
    summary,
    query: input.query,
    type: researchType,
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const RESEARCHER_SYSTEM_PROMPT = `\
You are a research agent for an AI-powered social media autopilot platform.

Your role: gather information about topics, competitors, trends, and news
that helps the tenant create better social media content. You use web search
(Tavily) for general research and structured scraping (Apify) for competitor
analysis.

You synthesize raw search results into actionable insights:
  - Key trends and patterns
  - Competitor strategies and positioning
  - Content angles and opportunities
  - Data points and statistics worth citing

Always relate findings back to the tenant's niche and goals when available.
Be specific and avoid generic advice.`;

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

export const researcherAgent: AgentDefinition<
  ResearcherInput,
  ResearcherOutput
> = {
  id: 'researcher',
  systemPrompt: RESEARCHER_SYSTEM_PROMPT,
  allowedSkills: [],
  run: runResearcher,
};

export default researcherAgent;
