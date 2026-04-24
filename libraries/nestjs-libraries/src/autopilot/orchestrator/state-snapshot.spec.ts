import { buildStateSnapshot, formatStateSnapshot } from './state-snapshot';
import type { StateSnapshotData } from './state-snapshot';

const NOW = new Date('2026-04-23T20:00:00Z');
const WEEK = new Date(NOW.getTime() + 7 * 24 * 60 * 60_000);

function makePrismaMock(seed: {
  integrations?: { providerIdentifier: string }[];
  cadences?: Array<{
    platform: string;
    postsPerDay: number;
    preferredTimes: unknown;
    pausedUntil: Date | null;
  }>;
  pending?: {
    id: string;
    waitingFor: string;
    collectedData: Record<string, unknown>;
    expiresAt: Date;
  } | null;
  upcoming?: Array<{ id: string; platform: string; scheduledAt: Date }>;
  upcomingCount?: number;
}) {
  return {
    integration: {
      findMany: jest.fn().mockResolvedValue(seed.integrations ?? []),
    },
    apCadenceConfig: {
      findMany: jest.fn().mockResolvedValue(seed.cadences ?? []),
    },
    apPendingAction: {
      findUnique: jest.fn().mockResolvedValue(seed.pending ?? null),
    },
    apScheduledSlot: {
      findMany: jest.fn().mockResolvedValue(seed.upcoming ?? []),
      count: jest
        .fn()
        .mockResolvedValue(seed.upcomingCount ?? (seed.upcoming?.length ?? 0)),
    },
  } as any;
}

describe('buildStateSnapshot', () => {
  test('returns empty defaults when org has no state', async () => {
    const db = makePrismaMock({});
    const snap = await buildStateSnapshot(db, {
      organizationId: 'org-1',
      now: NOW,
      timezone: 'UTC',
    });
    expect(snap.connectedPlatforms).toEqual([]);
    expect(snap.cadences).toEqual([]);
    expect(snap.pendingAction).toBeNull();
    expect(snap.upcomingScheduled).toEqual([]);
    expect(snap.upcomingScheduledCount).toBe(0);
    expect(snap.niche).toBeNull();
  });

  test('passes tenant context through (niche + opt-out flag)', async () => {
    const db = makePrismaMock({});
    const snap = await buildStateSnapshot(db, {
      organizationId: 'org-1',
      now: NOW,
      timezone: 'UTC',
      tenantCtx: { niche: 'SaaS', strategyOptout: true },
    });
    expect(snap.niche).toBe('SaaS');
    expect(snap.strategyOptout).toBe(true);
  });

  test('dedupes connected platforms and lists them', async () => {
    const db = makePrismaMock({
      integrations: [
        { providerIdentifier: 'twitter' },
        { providerIdentifier: 'twitter' },
        { providerIdentifier: 'linkedin' },
      ],
    });
    const snap = await buildStateSnapshot(db, {
      organizationId: 'org-1',
      now: NOW,
      timezone: 'UTC',
    });
    expect(snap.connectedPlatforms.sort()).toEqual(['linkedin', 'twitter']);
  });

  test('expired pending action is treated as none', async () => {
    const db = makePrismaMock({
      pending: {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: { topic: 'x' },
        expiresAt: new Date(NOW.getTime() - 60_000),
      },
    });
    const snap = await buildStateSnapshot(db, {
      organizationId: 'org-1',
      now: NOW,
      timezone: 'UTC',
    });
    expect(snap.pendingAction).toBeNull();
  });

  test('live pending action is included verbatim', async () => {
    const db = makePrismaMock({
      pending: {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: { topic: 'launch', platforms: ['twitter'] },
        expiresAt: new Date(NOW.getTime() + 5 * 60_000),
      },
    });
    const snap = await buildStateSnapshot(db, {
      organizationId: 'org-1',
      now: NOW,
      timezone: 'UTC',
    });
    expect(snap.pendingAction).toEqual({
      id: 'pa-1',
      waitingFor: 'timing',
      collectedData: { topic: 'launch', platforms: ['twitter'] },
      expiresAt: new Date(NOW.getTime() + 5 * 60_000),
    });
  });

  test('queries scheduled slots in a 7-day window', async () => {
    const db = makePrismaMock({});
    await buildStateSnapshot(db, {
      organizationId: 'org-1',
      now: NOW,
      timezone: 'UTC',
    });
    const findManyArgs = db.apScheduledSlot.findMany.mock.calls[0][0];
    expect(findManyArgs.where.scheduledAt.gte).toEqual(NOW);
    expect(findManyArgs.where.scheduledAt.lte).toEqual(WEEK);
    expect(findManyArgs.where.status).toBe('PENDING');
  });
});

describe('formatStateSnapshot', () => {
  const baseline: StateSnapshotData = {
    now: NOW,
    timezone: 'America/New_York',
    niche: null,
    strategyOptout: null,
    connectedPlatforms: [],
    cadences: [],
    pendingAction: null,
    upcomingScheduled: [],
    upcomingScheduledCount: 0,
  };

  test('always includes ISO now + user timezone', () => {
    const out = formatStateSnapshot(baseline);
    expect(out).toContain('now: 2026-04-23T20:00:00.000Z');
    expect(out).toContain('America/New_York');
  });

  test('"none" pending action renders explicitly', () => {
    const out = formatStateSnapshot(baseline);
    expect(out).toContain('pending_action: none');
  });

  test('pending action surfaces waitingFor + collected fields', () => {
    const out = formatStateSnapshot({
      ...baseline,
      pendingAction: {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: {
          platforms: ['twitter'],
          topic: 'launch',
          publishImmediately: undefined,
        },
        expiresAt: new Date(NOW.getTime() + 5 * 60_000),
      },
    });
    expect(out).toContain('waiting for "timing"');
    expect(out).toContain('platforms=twitter');
    expect(out).toContain('topic="launch"');
  });

  test('flags missing platform connections clearly', () => {
    const out = formatStateSnapshot(baseline);
    expect(out).toMatch(/connected_platforms:.*none/);
  });

  test('lists cadence with paused-until annotation', () => {
    const out = formatStateSnapshot({
      ...baseline,
      cadences: [
        {
          platform: 'linkedin',
          postsPerDay: 2,
          preferredTimes: ['09:00', '15:00'],
          pausedUntil: new Date(NOW.getTime() + 24 * 60 * 60_000),
        },
      ],
    });
    expect(out).toContain('linkedin: 2/day at 09:00/15:00');
    expect(out).toContain('paused until');
  });

  test('upcoming slots render with humanized + ISO time', () => {
    const out = formatStateSnapshot({
      ...baseline,
      upcomingScheduled: [
        {
          id: 's-1',
          platform: 'twitter',
          scheduledAt: new Date('2026-04-24T13:00:00Z'),
        },
      ],
      upcomingScheduledCount: 1,
    });
    expect(out).toContain('upcoming_scheduled_next_7d: 1');
    expect(out).toContain('twitter: tomorrow at 9:00 AM');
    expect(out).toContain('2026-04-24T13:00:00.000Z');
  });

  test('truncates very long topic so prompt stays compact', () => {
    const longTopic = 'a'.repeat(200);
    const out = formatStateSnapshot({
      ...baseline,
      pendingAction: {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: { topic: longTopic },
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });
    expect(out).toMatch(/topic="a+…"/);
    expect(out.length).toBeLessThan(longTopic.length + 200);
  });
});
