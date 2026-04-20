/**
 * Unit tests for the Analytics snapshot skill — slice 4.1
 *
 * The Prisma client and socialIntegrationList are mocked so tests run
 * without a real database or API key.
 */

// Mock the integration manager list before importing the skill.
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({
    socialIntegrationList: [],
  }),
);

import { handleAnalyticsSnapshot, analyticsSnapshotSkill } from './analytics_snapshot';
import type { AnalyticsSnapshotInput } from './analytics_snapshot';
import type { SkillContext, LlmProvider } from './types';
import type { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeLlm: LlmProvider = {
  model: {} as any,
  complete: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function makeCtx(dbOverrides: Partial<any> = {}): SkillContext {
  return {
    tenant: { id: 'org-tenant-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      integration: {
        findFirst: jest.fn(),
      },
      ...dbOverrides,
    } as any,
    llm: fakeLlm,
    logger: mockLogger,
  };
}

const MOCK_INTEGRATION = {
  id: 'int-abc',
  name: 'MyTwitterAccount',
  internalId: 'tw-internal-123',
  token: 'access-token-xyz',
  providerIdentifier: 'twitter',
};

const MOCK_ANALYTICS_DATA: AnalyticsData[] = [
  {
    label: 'Impressions',
    data: [{ total: '1000', date: '2026-04-01' }],
    percentageChange: 5.2,
  },
];

// Writable reference to the mocked list so tests can populate it.
const mutableList = socialIntegrationList as any[];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the mutable list to empty before each test.
  mutableList.length = 0;
});

describe('analyticsSnapshotSkill — registry shape', () => {
  it('has correct id and description', () => {
    expect(analyticsSnapshotSkill.id).toBe('analytics_snapshot');
    expect(typeof analyticsSnapshotSkill.description).toBe('string');
    expect(analyticsSnapshotSkill.description.length).toBeGreaterThan(0);
    expect(analyticsSnapshotSkill.handler).toBe(handleAnalyticsSnapshot);
  });
});

describe('handleAnalyticsSnapshot — integration not found', () => {
  it('returns supported=false when no integration row matches', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(null);

    const input: AnalyticsSnapshotInput = { platform: 'twitter' };
    const result = await handleAnalyticsSnapshot(ctx, input);

    expect(result.supported).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.platform).toBe('twitter');
    expect(result.note).toContain('twitter');
  });

  it('includes integrationId in note when provided', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(null);

    const input: AnalyticsSnapshotInput = {
      platform: 'linkedin',
      integrationId: 'int-999',
    };
    const result = await handleAnalyticsSnapshot(ctx, input);

    expect(result.supported).toBe(false);
    expect(result.integrationId).toBe('int-999');
    expect(result.note).toContain('int-999');
  });

  it('passes integrationId to the DB query when provided', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(null);

    const input: AnalyticsSnapshotInput = {
      platform: 'twitter',
      integrationId: 'int-specific',
    };
    await handleAnalyticsSnapshot(ctx, input);

    expect(ctx.db.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'int-specific' }),
      }),
    );
  });
});

describe('handleAnalyticsSnapshot — provider has no analytics() method', () => {
  it('returns supported=false when provider lacks analytics method', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );

    // Push a provider with no analytics method.
    mutableList.push({ identifier: 'twitter' /* no analytics */ });

    const input: AnalyticsSnapshotInput = { platform: 'twitter' };
    const result = await handleAnalyticsSnapshot(ctx, input);

    expect(result.supported).toBe(false);
    expect(result.integrationId).toBe(MOCK_INTEGRATION.id);
    expect(result.integrationName).toBe(MOCK_INTEGRATION.name);
    expect(result.data).toEqual([]);
    expect(result.note).toContain('does not support analytics');
  });

  it('returns supported=false when provider identifier not in list', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );
    // mutableList is empty — provider not found.

    const result = await handleAnalyticsSnapshot(ctx, { platform: 'twitter' });

    expect(result.supported).toBe(false);
    expect(result.note).toContain('does not support analytics');
  });
});

describe('handleAnalyticsSnapshot — successful analytics fetch', () => {
  it('returns data when provider.analytics() resolves', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );

    mutableList.push({
      identifier: 'twitter',
      analytics: jest.fn().mockResolvedValue(MOCK_ANALYTICS_DATA),
    });

    const input: AnalyticsSnapshotInput = { platform: 'twitter', periodDays: 14 };
    const result = await handleAnalyticsSnapshot(ctx, input);

    expect(result.supported).toBe(true);
    expect(result.data).toEqual(MOCK_ANALYTICS_DATA);
    expect(result.platform).toBe('twitter');
    expect(result.integrationId).toBe(MOCK_INTEGRATION.id);
    expect(result.integrationName).toBe(MOCK_INTEGRATION.name);
    expect(result.periodDays).toBe(14);
    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('passes internalId, token, and periodDays to provider.analytics()', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );
    const mockAnalytics = jest.fn().mockResolvedValue([]);
    mutableList.push({ identifier: 'twitter', analytics: mockAnalytics });

    await handleAnalyticsSnapshot(ctx, { platform: 'twitter', periodDays: 7 });

    expect(mockAnalytics).toHaveBeenCalledWith(
      MOCK_INTEGRATION.internalId,
      MOCK_INTEGRATION.token,
      7,
    );
  });

  it('defaults periodDays to 30 when omitted', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );
    const mockAnalytics = jest.fn().mockResolvedValue([]);
    mutableList.push({ identifier: 'twitter', analytics: mockAnalytics });

    const result = await handleAnalyticsSnapshot(ctx, { platform: 'twitter' });

    expect(mockAnalytics).toHaveBeenCalledWith(
      MOCK_INTEGRATION.internalId,
      MOCK_INTEGRATION.token,
      30,
    );
    expect(result.periodDays).toBe(30);
  });

  it('scopes DB query to tenant organizationId', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );
    mutableList.push({
      identifier: 'twitter',
      analytics: jest.fn().mockResolvedValue([]),
    });

    await handleAnalyticsSnapshot(ctx, { platform: 'twitter' });

    expect(ctx.db.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-1' }),
      }),
    );
  });
});

describe('handleAnalyticsSnapshot — provider.analytics() throws', () => {
  it('returns supported=true with empty data and a note when analytics call fails', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );
    mutableList.push({
      identifier: 'twitter',
      analytics: jest.fn().mockRejectedValue(new Error('rate limited')),
    });

    const result = await handleAnalyticsSnapshot(ctx, { platform: 'twitter' });

    expect(result.supported).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.note).toContain('rate limited');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('handles non-Error thrown values gracefully', async () => {
    const ctx = makeCtx();
    (ctx.db.integration.findFirst as jest.Mock).mockResolvedValue(
      MOCK_INTEGRATION,
    );
    mutableList.push({
      identifier: 'twitter',
      analytics: jest.fn().mockRejectedValue('string error'),
    });

    const result = await handleAnalyticsSnapshot(ctx, { platform: 'twitter' });

    expect(result.supported).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.note).toContain('string error');
  });
});
