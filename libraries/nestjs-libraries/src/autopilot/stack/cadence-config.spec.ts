/**
 * Unit tests for CadenceConfigService + applyCadenceConfig — slice 2.12
 *
 * Uses an in-memory mock of PrismaService.  No real DB required.
 */

import { CadenceConfigService, applyCadenceConfig } from './cadence-config.service';
import { ApCadenceConfigSource } from '@prisma/client';

// ---------------------------------------------------------------------------
// In-memory row type
// ---------------------------------------------------------------------------

type ConfigRow = {
  id: string;
  organizationId: string;
  platform: string;
  postsPerDay: number;
  preferredTimes: unknown[];
  timezone: string;
  pausedUntil: Date | null;
  active: boolean;
  source: ApCadenceConfigSource;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

let _idCtr = 0;
function nextId() {
  return `cfg-${++_idCtr}`;
}

function baseRow(overrides: Partial<ConfigRow> = {}): ConfigRow {
  return {
    id: nextId(),
    organizationId: 'org-1',
    platform: 'twitter',
    postsPerDay: 1,
    preferredTimes: [],
    timezone: 'UTC',
    pausedUntil: null,
    active: true,
    source: ApCadenceConfigSource.DEFAULT,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function makeMockDb(initial: Partial<ConfigRow>[] = []) {
  const rows: ConfigRow[] = initial.map((r) => baseRow(r));

  const apCadenceConfig = {
    async findUnique({ where }: any): Promise<ConfigRow | null> {
      const { organizationId, platform } = where.organizationId_platform ?? {};
      return (
        rows.find(
          (r) => r.organizationId === organizationId && r.platform === platform,
        ) ?? null
      );
    },

    async upsert({ where, create, update }: any): Promise<ConfigRow> {
      const { organizationId, platform } = where.organizationId_platform;
      const existing = rows.find(
        (r) => r.organizationId === organizationId && r.platform === platform,
      );

      if (existing) {
        // Apply update — handle { increment: 1 } for version
        const resolved: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(update)) {
          if (
            typeof v === 'object' &&
            v !== null &&
            'increment' in (v as object)
          ) {
            resolved[k] = (existing as any)[k] + (v as any).increment;
          } else {
            resolved[k] = v;
          }
        }
        Object.assign(existing, resolved, { updatedAt: new Date() });
        return { ...existing };
      } else {
        const row = baseRow({ ...create });
        rows.push(row);
        return { ...row };
      }
    },
  };

  return { apCadenceConfig, _rows: rows } as any;
}

function makeService(db: any): CadenceConfigService {
  return new CadenceConfigService(db);
}

beforeEach(() => {
  _idCtr = 0;
});

const ORG = 'org-1';
const PLATFORM = 'twitter';
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
const PAST = new Date(Date.now() - 1000); // 1 second ago

// ---------------------------------------------------------------------------
// pause()
// ---------------------------------------------------------------------------

describe('CadenceConfigService.pause', () => {
  it('creates a new config row with pausedUntil set', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    const result = await svc.pause(ORG, PLATFORM, FUTURE);

    expect(result.pausedUntil).toEqual(FUTURE);
    expect(result.source).toBe(ApCadenceConfigSource.USER);
    expect(result.organizationId).toBe(ORG);
    expect(result.platform).toBe(PLATFORM);
  });

  it('updates pausedUntil on an existing config and increments version', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: null, version: 3 },
    ]);
    const svc = makeService(db);

    const result = await svc.pause(ORG, PLATFORM, FUTURE);

    expect(result.pausedUntil).toEqual(FUTURE);
    expect(result.version).toBe(4);
    expect(result.source).toBe(ApCadenceConfigSource.USER);
  });

  it('overwrites an existing pausedUntil with a new one', async () => {
    const earlierDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: earlierDate },
    ]);
    const svc = makeService(db);

    const result = await svc.pause(ORG, PLATFORM, FUTURE);

    expect(result.pausedUntil).toEqual(FUTURE);
  });
});

// ---------------------------------------------------------------------------
// resume()
// ---------------------------------------------------------------------------

describe('CadenceConfigService.resume', () => {
  it('clears pausedUntil on an existing paused config', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: FUTURE, version: 2 },
    ]);
    const svc = makeService(db);

    const result = await svc.resume(ORG, PLATFORM);

    expect(result.pausedUntil).toBeNull();
    expect(result.version).toBe(3);
    expect(result.source).toBe(ApCadenceConfigSource.USER);
  });

  it('creates a config row with pausedUntil=null when none exists', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    const result = await svc.resume(ORG, PLATFORM);

    expect(result.pausedUntil).toBeNull();
    expect(result.organizationId).toBe(ORG);
    expect(result.platform).toBe(PLATFORM);
  });
});

// ---------------------------------------------------------------------------
// get()
// ---------------------------------------------------------------------------

describe('CadenceConfigService.get', () => {
  it('returns the config row if it exists', async () => {
    const db = makeMockDb([{ organizationId: ORG, platform: PLATFORM }]);
    const svc = makeService(db);

    const result = await svc.get(ORG, PLATFORM);

    expect(result).not.toBeNull();
    expect(result!.platform).toBe(PLATFORM);
  });

  it('returns null when no config exists for the pair', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    const result = await svc.get(ORG, 'linkedin');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isPaused()
// ---------------------------------------------------------------------------

describe('CadenceConfigService.isPaused', () => {
  it('returns false when no config exists', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    expect(await svc.isPaused(ORG, PLATFORM)).toBe(false);
  });

  it('returns false when pausedUntil is null', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: null },
    ]);
    const svc = makeService(db);

    expect(await svc.isPaused(ORG, PLATFORM)).toBe(false);
  });

  it('returns false when pausedUntil is in the past', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: PAST },
    ]);
    const svc = makeService(db);

    expect(await svc.isPaused(ORG, PLATFORM)).toBe(false);
  });

  it('returns true when pausedUntil is in the future', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: FUTURE },
    ]);
    const svc = makeService(db);

    expect(await svc.isPaused(ORG, PLATFORM)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyCadenceConfig (standalone applier function)
// ---------------------------------------------------------------------------

describe('applyCadenceConfig', () => {
  it('throws when targetId is null', async () => {
    const db = makeMockDb();
    await expect(
      applyCadenceConfig(db, ORG, null, { pausedUntil: FUTURE.toISOString() }),
    ).rejects.toThrow('targetId');
  });

  it('sets pausedUntil from ISO string', async () => {
    const db = makeMockDb();

    await applyCadenceConfig(db, ORG, PLATFORM, {
      pausedUntil: FUTURE.toISOString(),
    });

    const row = db._rows[0] as ConfigRow;
    expect(row.pausedUntil).toEqual(FUTURE);
    expect(row.source).toBe(ApCadenceConfigSource.AI);
  });

  it('clears pausedUntil when value is null', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, pausedUntil: FUTURE },
    ]);

    await applyCadenceConfig(db, ORG, PLATFORM, { pausedUntil: null });

    const row = db._rows[0] as ConfigRow;
    expect(row.pausedUntil).toBeNull();
  });

  it('updates postsPerDay, timezone, and preferredTimes', async () => {
    const db = makeMockDb();

    await applyCadenceConfig(db, ORG, PLATFORM, {
      postsPerDay: 3,
      timezone: 'America/New_York',
      preferredTimes: ['09:00', '15:00', '20:00'],
    });

    const row = db._rows[0] as ConfigRow;
    expect(row.postsPerDay).toBe(3);
    expect(row.timezone).toBe('America/New_York');
    expect(row.preferredTimes).toEqual(['09:00', '15:00', '20:00']);
  });

  it('sets active=false', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, active: true },
    ]);

    await applyCadenceConfig(db, ORG, PLATFORM, { active: false });

    const row = db._rows[0] as ConfigRow;
    expect(row.active).toBe(false);
  });

  it('ignores unknown / non-whitelisted fields', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, postsPerDay: 1 },
    ]);

    await applyCadenceConfig(db, ORG, PLATFORM, {
      postsPerDay: 5,
      _dangerousField: 'injected',
      organizationId: 'evil-tenant',
    });

    const row = db._rows[0] as ConfigRow;
    expect(row.postsPerDay).toBe(5);
    // organizationId must not be overwritten
    expect(row.organizationId).toBe(ORG);
  });

  it('increments version on update', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, version: 4 },
    ]);

    await applyCadenceConfig(db, ORG, PLATFORM, { active: false });

    const row = db._rows[0] as ConfigRow;
    expect(row.version).toBe(5);
  });
});
