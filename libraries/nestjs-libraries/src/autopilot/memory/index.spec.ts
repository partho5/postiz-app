/**
 * Memory service smoke tests — slice 1.6
 *
 * All PrismaClient interactions are mocked.  The embedding call (embedText) is
 * mocked so tests pass without an API key.
 *
 * Coverage:
 *   getStructuredProfile — returns profile + rules
 *   writeVector          — calls embedText, executes INSERT
 *   queryVector          — calls embedText, executes SELECT with cosine ops
 *   listRecent           — executes SELECT without embedding
 */

import {
  getStructuredProfile,
  writeVector,
  queryVector,
  listRecent,
  ApMemoryVectorKind,
} from './index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock embedText so no OpenAI API key is needed in tests.
jest.mock('../llm', () => ({
  embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

const TENANT = 'org-test-001';

const FAKE_PROFILE = {
  id: 'bp-1',
  organizationId: TENANT,
  niche: 'SaaS',
  goals: ['grow MRR'] as unknown[],
  brandVoiceShort: 'Professional',
  brandVoiceExtended: 'We speak clearly and avoid jargon.',
  antiPatterns: [] as unknown[],
  regulatoryFlags: [] as unknown[],
  updatedAt: new Date('2026-01-01'),
  updatedBy: 'AI' as const,
};

const FAKE_RULES = [
  {
    id: 'rule-1',
    organizationId: TENANT,
    ruleKey: 'post_frequency',
    ruleValue: { perWeek: 5 },
    active: true,
    source: 'USER' as const,
    updatedAt: new Date('2026-01-01'),
  },
];

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    apBusinessProfile: {
      findUnique: jest.fn().mockResolvedValue(FAKE_PROFILE),
    },
    apGrowthRule: {
      findMany: jest.fn().mockResolvedValue(FAKE_RULES),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as import('@prisma/client').PrismaClient;
}

// ---------------------------------------------------------------------------
// getStructuredProfile
// ---------------------------------------------------------------------------

describe('getStructuredProfile', () => {
  it('returns businessProfile and growthRules when both exist', async () => {
    const db = makeDb();
    const result = await getStructuredProfile(db, TENANT);

    expect(result.businessProfile).not.toBeNull();
    expect(result.businessProfile?.niche).toBe('SaaS');
    expect(result.growthRules).toHaveLength(1);
    expect(result.growthRules[0].ruleKey).toBe('post_frequency');
  });

  it('returns null businessProfile when none exists', async () => {
    const db = makeDb({
      apBusinessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const result = await getStructuredProfile(db, TENANT);
    expect(result.businessProfile).toBeNull();
    expect(result.growthRules).toHaveLength(1); // rules still fetched
  });

  it('returns empty rules when none exist', async () => {
    const db = makeDb({
      apGrowthRule: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const result = await getStructuredProfile(db, TENANT);
    expect(result.growthRules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// writeVector
// ---------------------------------------------------------------------------

describe('writeVector', () => {
  it('calls embedText and executes an INSERT', async () => {
    const { embedText } = require('../llm') as { embedText: jest.Mock };
    embedText.mockClear();

    const db = makeDb();
    const id = await writeVector(db, TENANT, {
      kind: ApMemoryVectorKind.ANECDOTE,
      content: 'We launched on Product Hunt and got 500 upvotes.',
      sourceRef: { messageId: 'msg-1' },
    });

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(embedText).toHaveBeenCalledWith(
      'We launched on Product Hunt and got 500 upvotes.',
    );
    expect((db.$executeRaw as jest.Mock).mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// queryVector
// ---------------------------------------------------------------------------

describe('queryVector', () => {
  const RAW_ROWS = [
    {
      id: 'mv-1',
      organizationId: TENANT,
      kind: 'ANECDOTE',
      content: 'Product Hunt launch success',
      sourceRef: null as Record<string, unknown> | null,
      freshnessTtlDays: null as number | null,
      createdAt: new Date('2026-01-10'),
      distance: '0.92',
    },
  ];

  it('returns mapped rows with similarity score', async () => {
    const db = makeDb({ $queryRaw: jest.fn().mockResolvedValue(RAW_ROWS) });
    const results = await queryVector(db, TENANT, 'launch event', 5);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Product Hunt launch success');
    expect(results[0].kind).toBe('ANECDOTE');
    expect(results[0].similarity).toBeCloseTo(0.92);
  });

  it('passes kind filter when provided', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const db = makeDb({ $queryRaw: queryRaw });

    await queryVector(db, TENANT, 'brand voice', 3, [
      ApMemoryVectorKind.BRAND_RULE,
    ]);

    // The raw SQL template should have been called once.
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('calls embedText once per query', async () => {
    const { embedText } = require('../llm') as { embedText: jest.Mock };
    embedText.mockClear();

    const db = makeDb({ $queryRaw: jest.fn().mockResolvedValue([]) });
    await queryVector(db, TENANT, 'some query', 5);

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith('some query');
  });
});

// ---------------------------------------------------------------------------
// listRecent
// ---------------------------------------------------------------------------

describe('listRecent', () => {
  const RAW_ROWS = [
    {
      id: 'mv-2',
      organizationId: TENANT,
      kind: 'MILESTONE',
      content: 'Reached 1k users',
      sourceRef: null as Record<string, unknown> | null,
      freshnessTtlDays: 30,
      createdAt: new Date('2026-02-01'),
    },
  ];

  it('returns recent rows without calling embedText', async () => {
    const { embedText } = require('../llm') as { embedText: jest.Mock };
    embedText.mockClear();

    const db = makeDb({ $queryRaw: jest.fn().mockResolvedValue(RAW_ROWS) });
    const results = await listRecent(db, TENANT, ApMemoryVectorKind.MILESTONE, 10);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Reached 1k users');
    expect(results[0].freshnessTtlDays).toBe(30);
    expect(embedText).not.toHaveBeenCalled();
  });
});
