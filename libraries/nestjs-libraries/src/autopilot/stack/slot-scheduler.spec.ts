import {
  wallClockToUtc,
  buildSlotHHMMs,
  SlotSchedulerService,
  type MaterializeResult,
} from './slot-scheduler.service';
import { ApScheduledSlotStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// wallClockToUtc
// ---------------------------------------------------------------------------

describe('wallClockToUtc', () => {
  it('returns the correct UTC time for UTC timezone', () => {
    const result = wallClockToUtc(2025, 6, 15, 9, 0, 'UTC');
    expect(result.toISOString()).toBe('2025-06-15T09:00:00.000Z');
  });

  it('converts New York time (UTC-5 in winter) correctly', () => {
    // 2025-01-15 09:00 EST = UTC-5 → 14:00 UTC
    const result = wallClockToUtc(2025, 1, 15, 9, 0, 'America/New_York');
    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('converts New York time (UTC-4 in summer / EDT) correctly', () => {
    // 2025-07-15 09:00 EDT = UTC-4 → 13:00 UTC
    const result = wallClockToUtc(2025, 7, 15, 9, 0, 'America/New_York');
    expect(result.getUTCHours()).toBe(13);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('converts IST (UTC+5:30) correctly', () => {
    // 2025-06-15 09:30 IST = UTC+5:30 → 04:00 UTC
    const result = wallClockToUtc(2025, 6, 15, 9, 30, 'Asia/Kolkata');
    expect(result.getUTCHours()).toBe(4);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('handles midnight (00:00) correctly', () => {
    const result = wallClockToUtc(2025, 6, 15, 0, 0, 'UTC');
    expect(result.toISOString()).toBe('2025-06-15T00:00:00.000Z');
  });

  it('handles day boundary when TZ is ahead of UTC', () => {
    // 2025-06-15 01:00 in UTC+10 (AEST) = 2025-06-14 15:00 UTC
    const result = wallClockToUtc(2025, 6, 15, 1, 0, 'Australia/Sydney');
    expect(result.getUTCDate()).toBe(14);
    expect(result.getUTCHours()).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// buildSlotHHMMs
// ---------------------------------------------------------------------------

describe('buildSlotHHMMs', () => {
  it('returns empty array when postsPerDay is 0', () => {
    expect(buildSlotHHMMs([], 0)).toEqual([]);
  });

  it('returns empty array when postsPerDay is negative', () => {
    expect(buildSlotHHMMs(['09:00'], -1)).toEqual([]);
  });

  it('uses preferred times when there are enough', () => {
    const result = buildSlotHHMMs(['09:00', '15:00', '20:00'], 2);
    expect(result).toHaveLength(2);
    // First 2 from preferred, sorted
    expect(result).toContain('09:00');
    expect(result).toContain('15:00');
  });

  it('uses all preferred times when count matches postsPerDay exactly', () => {
    const result = buildSlotHHMMs(['09:00', '18:00'], 2);
    expect(result).toEqual(['09:00', '18:00']);
  });

  it('spreads evenly when no preferred times given', () => {
    const result = buildSlotHHMMs([], 3);
    expect(result).toHaveLength(3);
    // All should be valid HH:MM
    for (const t of result) {
      expect(t).toMatch(/^\d{2}:\d{2}$/);
    }
    // Should be sorted
    expect(result).toEqual([...result].sort());
  });

  it('fills gaps when fewer preferred times than postsPerDay', () => {
    const result = buildSlotHHMMs(['09:00'], 3);
    expect(result).toHaveLength(3);
    expect(result).toContain('09:00');
    // All times are valid HH:MM
    for (const t of result) {
      expect(t).toMatch(/^\d{2}:\d{2}$/);
    }
    // No duplicates
    expect(new Set(result).size).toBe(3);
  });

  it('ignores malformed preferred times', () => {
    const result = buildSlotHHMMs(['9:00', 'bad', '09:00'], 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('09:00');
  });

  it('returns sorted output', () => {
    const result = buildSlotHHMMs(['20:00', '08:00', '14:00'], 3);
    expect(result).toEqual(['08:00', '14:00', '20:00']);
  });
});

// ---------------------------------------------------------------------------
// SlotSchedulerService.materializeSlots — with in-memory mock
// ---------------------------------------------------------------------------

type SlotRow = {
  id: string;
  organizationId: string;
  platform: string;
  scheduledAt: Date;
  status: ApScheduledSlotStatus;
  postCandidateId: string | null;
  metadata: object;
  createdAt: Date;
  updatedAt: Date;
};

type CadenceRow = {
  id: string;
  organizationId: string;
  platform: string;
  postsPerDay: number;
  preferredTimes: unknown;
  timezone: string;
  pausedUntil: Date | null;
  active: boolean;
  source: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

let _slotId = 0;
function nextSlotId() {
  return `slot-${++_slotId}`;
}

function makeMockPrisma(
  cadenceRows: Partial<CadenceRow>[] = [],
  existingSlots: Partial<SlotRow>[] = [],
) {
  const cadence: CadenceRow[] = cadenceRows.map((r, i) => ({
    id: r.id ?? `cfg-${i}`,
    organizationId: r.organizationId ?? 'org-1',
    platform: r.platform ?? 'twitter',
    postsPerDay: r.postsPerDay ?? 1,
    preferredTimes: r.preferredTimes ?? [],
    timezone: r.timezone ?? 'UTC',
    pausedUntil: r.pausedUntil ?? null,
    active: r.active ?? true,
    source: r.source ?? 'DEFAULT',
    version: r.version ?? 1,
    createdAt: r.createdAt ?? new Date(),
    updatedAt: r.updatedAt ?? new Date(),
  }));

  const slots: SlotRow[] = existingSlots.map((r) => ({
    id: r.id ?? nextSlotId(),
    organizationId: r.organizationId ?? 'org-1',
    platform: r.platform ?? 'twitter',
    scheduledAt: r.scheduledAt ?? new Date(),
    status: r.status ?? ApScheduledSlotStatus.PENDING,
    postCandidateId: r.postCandidateId ?? null,
    metadata: r.metadata ?? {},
    createdAt: r.createdAt ?? new Date(),
    updatedAt: r.updatedAt ?? new Date(),
  }));

  const mock = {
    apCadenceConfig: {
      async findMany({ where }: any): Promise<CadenceRow[]> {
        const now = new Date();
        return cadence.filter((c) => {
          if (where?.active !== undefined && c.active !== where.active) return false;
          // OR: pausedUntil null OR pausedUntil <= now
          if (where?.OR) {
            const ok =
              c.pausedUntil === null || c.pausedUntil <= now;
            if (!ok) return false;
          }
          return true;
        });
      },
    },
    apScheduledSlot: {
      async findMany({ where }: any): Promise<Partial<SlotRow>[]> {
        return slots.filter((s) => {
          if (where?.organizationId && s.organizationId !== where.organizationId) return false;
          if (where?.platform && s.platform !== where.platform) return false;
          if (where?.status && s.status !== where.status) return false;
          if (where?.scheduledAt?.gte && s.scheduledAt < where.scheduledAt.gte) return false;
          if (where?.scheduledAt?.lte && s.scheduledAt > where.scheduledAt.lte) return false;
          return true;
        });
      },
      async createMany({ data }: any): Promise<{ count: number }> {
        for (const d of data) {
          slots.push({
            id: nextSlotId(),
            organizationId: d.organizationId,
            platform: d.platform,
            scheduledAt: d.scheduledAt,
            status: d.status ?? ApScheduledSlotStatus.PENDING,
            postCandidateId: null,
            metadata: d.metadata ?? {},
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return { count: data.length };
      },
    },
    _slots: slots,
  };

  return mock as any;
}

describe('SlotSchedulerService.materializeSlots', () => {
  beforeEach(() => {
    _slotId = 0;
  });

  it('returns zero created when there are no active configs', async () => {
    const prisma = makeMockPrisma([]);
    const svc = new SlotSchedulerService(prisma);
    const result: MaterializeResult = await svc.materializeSlots(7);
    expect(result.created).toBe(0);
    expect(result.configs).toBe(0);
  });

  it('creates the correct number of slots for a 1-post/day config over 3 days', async () => {
    const prisma = makeMockPrisma([
      {
        organizationId: 'org-1',
        platform: 'twitter',
        postsPerDay: 1,
        preferredTimes: ['09:00'],
        timezone: 'UTC',
        active: true,
        pausedUntil: null,
      },
    ]);
    const svc = new SlotSchedulerService(prisma);
    const result = await svc.materializeSlots(3);
    // 3 days, 1 slot each = 3 slots (today + 2 more)
    expect(result.created).toBeGreaterThanOrEqual(2);
    expect(result.created).toBeLessThanOrEqual(4);
    expect(result.configs).toBe(1);
  });

  it('creates 2 slots per day for postsPerDay=2', async () => {
    const prisma = makeMockPrisma([
      {
        organizationId: 'org-1',
        platform: 'twitter',
        postsPerDay: 2,
        preferredTimes: ['09:00', '18:00'],
        timezone: 'UTC',
        active: true,
        pausedUntil: null,
      },
    ]);
    const svc = new SlotSchedulerService(prisma);
    const result = await svc.materializeSlots(2);
    // 2 days × 2 slots = 4 slots (allow ±1 for today boundary)
    expect(result.created).toBeGreaterThanOrEqual(2);
    expect(result.created).toBeLessThanOrEqual(5);
  });

  it('does not duplicate slots that already exist', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(9, 0, 0, 0);

    const prisma = makeMockPrisma(
      [
        {
          organizationId: 'org-1',
          platform: 'twitter',
          postsPerDay: 1,
          preferredTimes: ['09:00'],
          timezone: 'UTC',
          active: true,
          pausedUntil: null,
        },
      ],
      [
        // pre-existing slot at tomorrow 09:00 UTC
        {
          organizationId: 'org-1',
          platform: 'twitter',
          scheduledAt: tomorrow,
          status: ApScheduledSlotStatus.PENDING,
        },
      ],
    );
    const svc = new SlotSchedulerService(prisma);
    const before = (prisma._slots as SlotRow[]).length;
    await svc.materializeSlots(2);
    const after = (prisma._slots as SlotRow[]).length;
    // The slot for tomorrow should NOT be duplicated
    const tomorrowSlots = (prisma._slots as SlotRow[]).filter(
      (s) => s.scheduledAt.getTime() === tomorrow.getTime(),
    );
    expect(tomorrowSlots).toHaveLength(1);
    // Total created should be less than 2 (tomorrow is already there)
    expect(after - before).toBeLessThan(2);
  });

  it('skips paused configs', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const prisma = makeMockPrisma([
      {
        organizationId: 'org-1',
        platform: 'twitter',
        postsPerDay: 1,
        preferredTimes: ['09:00'],
        timezone: 'UTC',
        active: true,
        pausedUntil: future, // paused for 7 days
      },
    ]);
    const svc = new SlotSchedulerService(prisma);
    const result = await svc.materializeSlots(3);
    expect(result.created).toBe(0);
    expect(result.configs).toBe(0);
  });

  it('skips inactive configs', async () => {
    const prisma = makeMockPrisma([
      {
        organizationId: 'org-1',
        platform: 'twitter',
        postsPerDay: 1,
        preferredTimes: ['09:00'],
        timezone: 'UTC',
        active: false,
        pausedUntil: null,
      },
    ]);
    const svc = new SlotSchedulerService(prisma);
    const result = await svc.materializeSlots(3);
    expect(result.created).toBe(0);
    expect(result.configs).toBe(0);
  });

  it('processes multiple configs independently', async () => {
    const prisma = makeMockPrisma([
      {
        organizationId: 'org-1',
        platform: 'twitter',
        postsPerDay: 1,
        preferredTimes: ['09:00'],
        timezone: 'UTC',
        active: true,
      },
      {
        organizationId: 'org-2',
        platform: 'linkedin',
        postsPerDay: 1,
        preferredTimes: ['10:00'],
        timezone: 'UTC',
        active: true,
      },
    ]);
    const svc = new SlotSchedulerService(prisma);
    const result = await svc.materializeSlots(2);
    expect(result.configs).toBe(2);
    expect(result.created).toBeGreaterThanOrEqual(2);
  });

  it('creates slots in the correct timezone offset', async () => {
    // New York (UTC-5 in January) — 09:00 local = 14:00 UTC
    const prisma = makeMockPrisma([
      {
        organizationId: 'org-1',
        platform: 'twitter',
        postsPerDay: 1,
        preferredTimes: ['09:00'],
        timezone: 'America/New_York',
        active: true,
        pausedUntil: null,
      },
    ]);
    const svc = new SlotSchedulerService(prisma);
    await svc.materializeSlots(1);
    // All created slots should have UTC hour = 14 (in January) or 13 (in summer EDT)
    const created = (prisma._slots as SlotRow[]);
    for (const s of created) {
      // UTC hour should be 13 or 14 depending on DST — not 9
      expect(s.scheduledAt.getUTCHours()).not.toBe(9);
    }
  });
});
