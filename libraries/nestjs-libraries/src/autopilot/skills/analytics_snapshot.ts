/**
 * Analytics snapshot skill — slice 4.1
 *
 * Fetches per-platform analytics for a tenant by delegating to the existing
 * Postiz integration provider `analytics()` methods.  Returns structured
 * engagement data (impressions, likes, comments, shares, etc.) for a
 * configurable look-back window.
 *
 * No LLM call is made — this is a pure data fetch.  LLM-based analysis of
 * the returned data is the responsibility of the Analyzer agent (slice 4.4).
 *
 * Dependencies (verified against actual source files):
 *   socialIntegrationList            — integration.manager.ts (exported array)
 *   AnalyticsData                    — integrations/social/social.integrations.interface.ts
 *   SkillEntry, SkillContext         — skills/types.ts
 *   PrismaClient                     — @prisma/client
 */

import { PrismaClient } from '@prisma/client';
import type { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import type { SkillEntry, SkillContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnalyticsSnapshotInput {
  /**
   * Postiz providerIdentifier for the platform.
   * E.g. 'twitter', 'linkedin', 'instagram', 'facebook'.
   */
  platform: string;
  /**
   * Optional Postiz Integration.id.  When a tenant has multiple accounts for
   * the same platform (e.g. two Twitter accounts), this disambiguates which
   * account to query.  When omitted, the first active non-disabled integration
   * for the platform is used.
   */
  integrationId?: string;
  /**
   * Number of days to look back.  Defaults to 30.
   */
  periodDays?: number;
}

export interface AnalyticsSnapshotOutput {
  platform: string;
  /** The Postiz Integration.id that was queried. */
  integrationId: string;
  /** Human-readable name of the integration (e.g. the handle or page name). */
  integrationName: string;
  /** Raw analytics from the provider.  Empty array when unsupported or errored. */
  data: AnalyticsData[];
  /** ISO timestamp of when this snapshot was taken. */
  capturedAt: string;
  periodDays: number;
  /**
   * `false` when the provider has no `analytics()` method or when no
   * matching integration was found.
   */
  supported: boolean;
  /** Human-readable note (e.g. error description or unsupported explanation). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Skill handler
// ---------------------------------------------------------------------------

/**
 * Fetch platform analytics for the calling tenant.
 *
 * Resolution order:
 *  1. Query `Integration` rows filtered by `(organizationId, providerIdentifier, disabled=false, deletedAt=null)`.
 *  2. If `integrationId` is provided, add `id = integrationId` to the query.
 *  3. If no row found → return `{ supported: false, data: [] }`.
 *  4. Find the provider in `socialIntegrationList` by `identifier === providerIdentifier`.
 *  5. If provider has no `analytics()` method → return `{ supported: false, data: [] }`.
 *  6. Call `provider.analytics(internalId, token, periodDays)`.
 *  7. On error → log a warning, return empty data with a note.
 *
 * Token refresh is intentionally NOT performed here — that is the
 * responsibility of `IntegrationService.checkAnalytics()` which runs through
 * the full auth flow.  If the token is expired we will simply receive an
 * error from the provider, which we handle gracefully.
 */
export async function handleAnalyticsSnapshot(
  ctx: SkillContext,
  input: AnalyticsSnapshotInput,
): Promise<AnalyticsSnapshotOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;
  const periodDays = input.periodDays ?? 30;
  const capturedAt = new Date().toISOString();

  // 1. Resolve the Integration row from DB.
  const integration = await db.integration.findFirst({
    where: {
      organizationId: tenantId,
      providerIdentifier: input.platform,
      disabled: false,
      deletedAt: null,
      ...(input.integrationId ? { id: input.integrationId } : {}),
    },
    select: {
      id: true,
      name: true,
      internalId: true,
      token: true,
      providerIdentifier: true,
    },
  });

  if (!integration) {
    return {
      platform: input.platform,
      integrationId: input.integrationId ?? '',
      integrationName: '',
      data: [],
      capturedAt,
      periodDays,
      supported: false,
      note: `No active integration found for platform "${input.platform}"${input.integrationId ? ` with id "${input.integrationId}"` : ''}.`,
    };
  }

  // 2. Find the social provider in the registry.
  const provider = socialIntegrationList.find(
    (p) => p.identifier === integration.providerIdentifier,
  );

  if (!provider || !provider.analytics) {
    return {
      platform: input.platform,
      integrationId: integration.id,
      integrationName: integration.name,
      data: [],
      capturedAt,
      periodDays,
      supported: false,
      note: `Provider "${integration.providerIdentifier}" does not support analytics.`,
    };
  }

  // 3. Fetch analytics from the provider.
  try {
    const data = await provider.analytics(
      integration.internalId,
      integration.token,
      periodDays,
    );

    return {
      platform: input.platform,
      integrationId: integration.id,
      integrationName: integration.name,
      data,
      capturedAt,
      periodDays,
      supported: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.warn(
      `[analytics_snapshot] provider.analytics() failed for integration ${integration.id} (${integration.providerIdentifier}): ${message}`,
    );

    return {
      platform: input.platform,
      integrationId: integration.id,
      integrationName: integration.name,
      data: [],
      capturedAt,
      periodDays,
      supported: true, // provider supports it, but this call failed
      note: `Analytics fetch failed: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// SkillEntry
// ---------------------------------------------------------------------------

export const analyticsSnapshotSkill: SkillEntry<
  AnalyticsSnapshotInput,
  AnalyticsSnapshotOutput
> = {
  id: 'analytics_snapshot',
  description:
    'Fetch per-platform engagement analytics (impressions, likes, comments, shares) for a connected social media integration. Returns raw analytics data from the platform provider.',
  handler: handleAnalyticsSnapshot,
};

export default analyticsSnapshotSkill;
