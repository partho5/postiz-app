/**
 * Analyzer agent — slices 4.4 (performance → tenant memory) + 4.5 (anonymized pattern extraction)
 *
 * Analyzes the performance of recently published posts for a tenant + platform pair:
 *
 *   Slice 4.4 — Tenant memory
 *     Reads recent ApPublishedPost rows (+ their ApPostCandidate content) and any
 *     pre-fetched analytics data, then asks the LLM to produce 3-7 actionable
 *     performance insights.  Each insight is written to the tenant's vector memory
 *     as a LEARNING entry so the copywriter and memorist agents benefit on future
 *     runs.
 *
 *   Slice 4.5 — Strategy pattern extraction
 *     The same LLM call also produces 1-3 anonymized, generalizable strategy
 *     patterns.  Before storing them the agent checks ApTenantStrategyOptout.
 *     If the tenant has not opted out, patterns are upserted into ApStrategyPattern
 *     (incrementing evidenceCount on collisions so cross-tenant aggregation
 *     improves over time).
 *
 * Dependencies (verified against actual source files):
 *   getStructuredProfile(db, tenantId) — memory/index.ts
 *   writeVector(db, tenantId, entry)   — memory/index.ts
 *   AgentDefinition, AgentContext      — agents/types.ts
 *   ApStrategyPatternType              — @prisma/client (slice 4.3 migration)
 *   generateObject                     — ai-v5
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { ApStrategyPatternType, PrismaClient } from '@prisma/client';
import type { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { getStructuredProfile, writeVector } from '../memory';
import type { AgentDefinition, AgentContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PerformanceInsight {
  /** Categorizes the insight for filtering and display. */
  type: 'strength' | 'weakness' | 'opportunity' | 'learning';
  /** Short, specific title (≤120 chars). */
  title: string;
  /** Clear explanation of what was observed and why it matters (≤500 chars). */
  description: string;
  /** LLM's confidence in this insight given the available data. */
  confidence: 'high' | 'medium' | 'low';
}

export interface AnalyzerInput {
  /** Social platform to analyze (e.g. 'twitter', 'linkedin'). */
  platform: string;
  /** Look-back window in days. Defaults to 30. */
  periodDays?: number;
  /**
   * Pre-fetched analytics data from the analytics_snapshot skill.
   * When omitted, the agent still analyzes post content and cadence but
   * cannot correlate content patterns with specific engagement numbers.
   */
  analyticsData?: {
    data: AnalyticsData[];
    capturedAt: string;
    supported: boolean;
    note?: string;
  };
}

export interface AnalyzerOutput {
  platform: string;
  periodDays: number;
  /** Number of published posts included in the analysis. */
  postsAnalyzed: number;
  /** Performance insights produced for this tenant. */
  insights: PerformanceInsight[];
  /** Number of insights written to tenant vector memory. */
  stored: number;
  /** Number of anonymized strategy patterns upserted (0 if opted out or LLM produced none). */
  patternsExtracted: number;
  /** Whether the tenant has opted out of contributing to cross-tenant patterns. */
  optedOut: boolean;
}

// ---------------------------------------------------------------------------
// LLM output schema
// ---------------------------------------------------------------------------

const PATTERN_TYPES = Object.values(ApStrategyPatternType) as [
  ApStrategyPatternType,
  ...ApStrategyPatternType[]
];

const analyzerSchema = z.object({
  insights: z
    .array(
      z.object({
        type: z.enum(['strength', 'weakness', 'opportunity', 'learning']),
        title: z.string().max(120).describe('Short, specific insight title'),
        description: z
          .string()
          .max(500)
          .describe('Clear explanation of what was observed and why it matters'),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
    )
    .describe(
      'Tenant-specific performance insights — may reference brand voice, niche, and content details. Produce 3-7 entries.',
    ),
  patterns: z
    .array(
      z.object({
        patternType: z
          .enum(PATTERN_TYPES)
          .describe('Category of this strategy pattern'),
        patternKey: z
          .string()
          .regex(/^[a-z][a-z0-9_]{0,79}$/)
          .describe(
            'Stable snake_case identifier used for deduplication across analyses, e.g. "numbered_lists_drive_shares".',
          ),
        title: z
          .string()
          .max(120)
          .describe(
            'Short, universal title — contains NO tenant names, handles, or brand-specific detail',
          ),
        description: z
          .string()
          .max(400)
          .describe(
            'Fully anonymized, generalizable observation. Must NOT contain any tenant-identifying information.',
          ),
        nicheCategory: z
          .string()
          .max(60)
          .optional()
          .describe(
            'Broad niche label if clearly applicable, e.g. "SaaS", "E-commerce", "Fitness". Omit when uncertain.',
          ),
      }),
    )
    .describe(
      'Anonymized strategy patterns for cross-tenant aggregation. Produce 1-3 entries when the data supports clear generalization; produce 0 when the sample is too small or data is too sparse.',
    ),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ANALYZER_SYSTEM_PROMPT = `\
You are a social-media performance analyst for an AI autopilot product.

You will receive:
  1. A tenant's business profile (niche, brand voice, goals) — use for context only.
  2. A list of recently published posts with content and structural metadata.
  3. Aggregate engagement analytics for the same platform/period (when available).

Produce two arrays:

─── INSIGHTS (3–7 entries) ─────────────────────────────────────────────────
Tenant-specific, actionable observations about what is working or not working.
Each insight must be:
  • type:        "strength" | "weakness" | "opportunity" | "learning"
  • title:       ≤120 chars, specific (what happened, not a generic label)
  • description: ≤500 chars, explains the evidence and the implication
  • confidence:  "high" (clear trend) | "medium" (some evidence) | "low" (limited data)

─── PATTERNS (0–3 entries) ─────────────────────────────────────────────────
Generalizable patterns suitable for cross-tenant aggregation.
STRICT RULES:
  • Zero tenant-identifying information: no brand names, handles, specific niches, or unique details
  • Must be universally applicable to a broad category of creators
  • patternKey: stable snake_case identifier, e.g. "question_hooks_drive_comments"
  • Use broad niche labels only if clearly applicable ("professional services", not company names)
  • Only produce patterns when the data provides genuine statistical or qualitative evidence
  • When the sample is too small or data is too sparse, output an empty "patterns" array

Output both arrays even when analytics are unavailable — use lower confidence for data-sparse scenarios.`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch recent published posts with their candidate content for a platform. */
async function loadRecentPosts(
  db: PrismaClient,
  tenantId: string,
  platform: string,
  since: Date,
) {
  const rows = await db.apPublishedPost.findMany({
    where: {
      organizationId: tenantId,
      platform,
      publishedAt: { gte: since },
    },
    include: {
      postCandidate: {
        select: {
          content: true,
          source: true,
          metadata: true,
        },
      },
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });

  return rows.map((r) => ({
    id: r.id,
    publishedAt: r.publishedAt,
    content: r.postCandidate.content,
    source: r.postCandidate.source,
    candidateMeta: (r.postCandidate.metadata as Record<string, unknown>) ?? {},
  }));
}

type RecentPost = Awaited<ReturnType<typeof loadRecentPosts>>[number];

/** Serialize published posts to a prompt-friendly block. */
function buildPostsBlock(posts: RecentPost[]): string {
  if (posts.length === 0) {
    return 'No published posts found in this period.';
  }

  return posts
    .slice(0, 20)
    .map((p, i) => {
      const meta = p.candidateMeta;
      const extras: string[] = [];
      if (meta.hookType) extras.push(`Hook: ${meta.hookType}`);
      if (Array.isArray(meta.hashtags) && meta.hashtags.length > 0) {
        extras.push(`Hashtags: ${(meta.hashtags as string[]).join(', ')}`);
      }
      if (meta.cta) extras.push(`CTA: ${meta.cta}`);

      const contentPreview =
        p.content.length > 300
          ? `${p.content.slice(0, 300)}…`
          : p.content;

      const lines = [
        `[Post ${i + 1}] ${p.publishedAt.toISOString().slice(0, 10)} | source: ${p.source}`,
      ];
      if (extras.length > 0) lines.push(`  ${extras.join(' | ')}`);
      lines.push(`  "${contentPreview}"`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** Serialize analytics data to a prompt-friendly block. */
function buildAnalyticsBlock(
  analyticsData: AnalyzerInput['analyticsData'],
): string {
  if (
    !analyticsData ||
    !analyticsData.supported ||
    analyticsData.data.length === 0
  ) {
    return 'Analytics data: not available for this period.';
  }

  const rows = analyticsData.data.map((metric) => {
    const trend =
      metric.percentageChange >= 0
        ? `+${metric.percentageChange.toFixed(1)}%`
        : `${metric.percentageChange.toFixed(1)}%`;
    const latest =
      metric.data.length > 0
        ? metric.data[metric.data.length - 1].total
        : 'N/A';
    return `  ${metric.label}: ${latest} (${trend} vs prior period)`;
  });

  return `Aggregate engagement metrics (${analyticsData.capturedAt.slice(0, 10)}):\n${rows.join('\n')}`;
}

/** Return true when the tenant has opted out of strategy-pattern extraction. */
async function checkOptout(
  db: PrismaClient,
  tenantId: string,
): Promise<boolean> {
  const row = await db.apTenantStrategyOptout.findUnique({
    where: { organizationId: tenantId },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Upsert a strategy pattern row.
 * Collision key: (platform, patternKey) — see @@unique in schema.
 * On collision: increment evidenceCount and refresh description.
 */
async function upsertStrategyPattern(
  db: PrismaClient,
  platform: string,
  pattern: {
    patternType: ApStrategyPatternType;
    patternKey: string;
    title: string;
    description: string;
    nicheCategory?: string;
  },
): Promise<void> {
  await db.apStrategyPattern.upsert({
    where: { platform_patternKey: { platform, patternKey: pattern.patternKey } },
    create: {
      platform,
      niche: pattern.nicheCategory ?? null,
      patternType: pattern.patternType,
      patternKey: pattern.patternKey,
      title: pattern.title,
      description: pattern.description,
      evidenceCount: 1,
    },
    update: {
      // Refresh description with the latest wording; increment evidence count.
      description: pattern.description,
      evidenceCount: { increment: 1 },
      // Keep niche from first observation unless explicitly provided again.
      ...(pattern.nicheCategory ? { niche: pattern.nicheCategory } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function runAnalyzer(
  ctx: AgentContext,
  input: AnalyzerInput,
): Promise<AnalyzerOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;
  const periodDays = input.periodDays ?? 30;
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  // ── 1. Load data ──────────────────────────────────────────────────────────

  const [posts, profile] = await Promise.all([
    loadRecentPosts(db, tenantId, input.platform, since),
    getStructuredProfile(db, tenantId),
  ]);

  // ── 2. Build LLM prompt ───────────────────────────────────────────────────

  const profileBlock = profile.businessProfile
    ? [
        `Niche: ${profile.businessProfile.niche}`,
        `Goals: ${JSON.stringify(profile.businessProfile.goals)}`,
        `Brand voice: ${profile.businessProfile.brandVoiceShort}`,
        profile.businessProfile.antiPatterns
          ? `Anti-patterns to avoid: ${JSON.stringify(profile.businessProfile.antiPatterns)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'Business profile: not yet configured.';

  const activeRules = profile.growthRules.filter((r) => r.active);
  const rulesBlock =
    activeRules.length > 0
      ? activeRules.map((r) => `  ${r.ruleKey}: ${JSON.stringify(r.ruleValue)}`).join('\n')
      : '  None configured.';

  const prompt = [
    `PLATFORM: ${input.platform}`,
    `ANALYSIS PERIOD: last ${periodDays} days`,
    '',
    '── BUSINESS PROFILE ──',
    profileBlock,
    '',
    '── ACTIVE GROWTH RULES ──',
    rulesBlock,
    '',
    '── PUBLISHED POSTS ──',
    buildPostsBlock(posts),
    '',
    '── ANALYTICS ──',
    buildAnalyticsBlock(input.analyticsData),
  ].join('\n');

  // ── 3. LLM analysis ───────────────────────────────────────────────────────

  const { object } = await generateObject({
    model: ctx.llm.model,
    schema: analyzerSchema,
    prompt,
    system: ANALYZER_SYSTEM_PROMPT,
  });

  const insights: PerformanceInsight[] = object.insights.map((i) => ({
    type: i.type as PerformanceInsight['type'],
    title: i.title,
    description: i.description,
    confidence: i.confidence as PerformanceInsight['confidence'],
  }));

  // ── 4. Write insights to tenant memory (LEARNING kind) ────────────────────

  let stored = 0;
  const generatedAt = new Date().toISOString();

  await Promise.all(
    insights.map(async (insight) => {
      const content = `[${insight.type.toUpperCase()}] ${insight.title}: ${insight.description}`;
      try {
        await writeVector(db, tenantId, {
          kind: 'LEARNING',
          content,
          sourceRef: {
            platform: input.platform,
            periodDays,
            insightType: insight.type,
            confidence: insight.confidence,
            generatedAt,
          },
        });
        stored++;
      } catch (err: unknown) {
        ctx.logger.warn(
          `[analyzer] failed to write insight to memory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  // ── 5. Slice 4.5: Anonymized strategy pattern extraction ─────────────────

  const optedOut = await checkOptout(db, tenantId);
  let patternsExtracted = 0;

  if (!optedOut && object.patterns.length > 0) {
    await Promise.all(
      object.patterns.map(async (p) => {
        try {
          await upsertStrategyPattern(db, input.platform, {
            patternType: p.patternType as ApStrategyPatternType,
            patternKey: p.patternKey,
            title: p.title,
            description: p.description,
            nicheCategory: p.nicheCategory,
          });
          patternsExtracted++;
        } catch (err: unknown) {
          ctx.logger.warn(
            `[analyzer] failed to upsert pattern "${p.patternKey}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }

  ctx.logger.info(
    `[analyzer] ${input.platform}: analyzed ${posts.length} posts, stored ${stored} insights, extracted ${patternsExtracted} patterns (optedOut=${optedOut})`,
  );

  return {
    platform: input.platform,
    periodDays,
    postsAnalyzed: posts.length,
    insights,
    stored,
    patternsExtracted,
    optedOut,
  };
}

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

export const analyzerAgent: AgentDefinition<AnalyzerInput, AnalyzerOutput> = {
  id: 'analyzer',
  systemPrompt: ANALYZER_SYSTEM_PROMPT,
  allowedSkills: ['analytics_snapshot'],
  run: runAnalyzer,
};

export default analyzerAgent;
