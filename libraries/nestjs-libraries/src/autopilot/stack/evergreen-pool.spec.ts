/**
 * Unit tests for EvergreenPoolService — slice 2.11
 *
 * Uses an in-memory mock of PrismaService so no DB is required.
 * Also verifies (via the existing stack primitives) that popTop() naturally
 * prefers regular candidates (priority ≥ 0) over evergreen (priority = -1).
 */

import { EvergreenPoolService } from './evergreen-pool.service';
import { popTop, ApPostCandidateStatus } from './index';

// ---------------------------------------------------------------------------
// In-memory mock row type
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  organizationId: string;
  platform: string;
  content: string;
  contentVariants: object;
  mediaUrls: unknown[];
  status: ApPostCandidateStatus;
  priority: number;
  source: string;
  expiresAt: Date | null;
  metadata: object;
  createdAt: Date;
  updatedAt: Date;
};

let _idCounter = 0;
function nextId() {
  return `eg-${++_idCounter}`;
}

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function makeMockDb(initial: Partial<Row>[] = []) {
  const rows: Row[] = initial.map((r, i) => ({
    id: r.id ?? nextId(),
    organizationId: r.organizationId ?? 'org-1',
    platform: r.platform ?? 'twitter',
    content: r.content ?? 'evergreen content',
    contentVariants: r.contentVariants ?? {},
    mediaUrls: r.mediaUrls ?? [],
    status: r.status ?? ApPostCandidateStatus.PENDING,
    priority: r.priority ?? -1,
    source: r.source ?? 'evergreen',
    expiresAt: r.expiresAt ?? null,
    metadata: r.metadata ?? {},
    createdAt: r.createdAt ?? new Date(Date.now() + i * 1000),
    updatedAt: r.updatedAt ?? new Date(),
  }));

  const apPostCandidate = {
    async create({ data }: any): Promise<Row> {
      const row: Row = {
        id: nextId(),
        organizationId: data.organizationId,
        platform: data.platform,
        content: data.content,
        contentVariants: data.contentVariants ?? {},
        mediaUrls: data.mediaUrls ?? [],
        status: data.status ?? ApPostCandidateStatus.PENDING,
        priority: data.priority ?? -1,
        source: data.source ?? 'evergreen',
        expiresAt: data.expiresAt ?? null,
        metadata: data.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return row;
    },

    async findUniqueOrThrow({ where }: any): Promise<Row> {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`Row ${where.id} not found`);
      return { ...row };
    },

    async update({ where, data }: any): Promise<Row> {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`Row ${where.id} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },

    async count({ where }: any): Promise<number> {
      return rows.filter((r) => {
        if (where.organizationId && r.organizationId !== where.organizationId) return false;
        if (where.platform && r.platform !== where.platform) return false;
        if (where.source && r.source !== where.source) return false;
        if (where.status && r.status !== where.status) return false;
        return true;
      }).length;
    },
  };

  // $queryRaw for pickFallback: filters by organizationId, platform, source='evergreen', PENDING
  async function $queryRaw<T>(strings: any, ...values: any[]): Promise<T> {
    const sql: string = Array.isArray(strings) ? strings.join('') : String(strings);
    const isEvergreenQuery = sql.includes("source = 'evergreen'");

    const [tenantId, platform] = values as [string, string];
    const now = new Date();

    const eligible = rows
      .filter((r) => {
        if (r.organizationId !== tenantId) return false;
        if (r.platform !== platform) return false;
        if (r.status !== ApPostCandidateStatus.PENDING) return false;
        if (isEvergreenQuery) {
          return r.source === 'evergreen';
        }
        // Fallback: regular popTop query (exclude expired)
        return r.expiresAt === null || r.expiresAt > now;
      })
      .sort((a, b) => {
        if (!isEvergreenQuery) {
          // popTop order: priority DESC, createdAt ASC
          if (b.priority !== a.priority) return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    if (eligible.length === 0) return [] as unknown as T;
    return [{ id: eligible[0].id }] as unknown as T;
  }

  const db = {
    apPostCandidate,
    $queryRaw,
    async $transaction(fn: (tx: any) => Promise<any>) {
      return fn({ apPostCandidate, $queryRaw });
    },
    _rows: rows,
  } as any;

  return db;
}

// ---------------------------------------------------------------------------
// Helper: build service with mock DB
// ---------------------------------------------------------------------------

function makeService(db: any): EvergreenPoolService {
  return new EvergreenPoolService(db);
}

const ORG = 'org-1';
const PLATFORM = 'twitter';

beforeEach(() => {
  _idCounter = 0;
});

// ---------------------------------------------------------------------------
// seedEvergreen
// ---------------------------------------------------------------------------

describe('EvergreenPoolService.seedEvergreen', () => {
  it('creates a row with source=evergreen, expiresAt=null, default priority=-1', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    const row = await svc.seedEvergreen(ORG, PLATFORM, 'Evergreen post body');

    expect(row.source).toBe('evergreen');
    expect(row.expiresAt).toBeNull();
    expect(row.priority).toBe(-1);
    expect(row.status).toBe(ApPostCandidateStatus.PENDING);
    expect(row.organizationId).toBe(ORG);
    expect(row.platform).toBe(PLATFORM);
    expect(row.content).toBe('Evergreen post body');
  });

  it('respects a custom priority override', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    const row = await svc.seedEvergreen(ORG, PLATFORM, 'Priority post', { priority: -5 });
    expect(row.priority).toBe(-5);
  });

  it('stores mediaUrls and contentVariants', async () => {
    const db = makeMockDb();
    const svc = makeService(db);

    const row = await svc.seedEvergreen(ORG, PLATFORM, 'Post with media', {
      mediaUrls: ['https://example.com/img.png'],
      contentVariants: { linkedin: 'LinkedIn version' },
    });
    expect(row.mediaUrls).toEqual(['https://example.com/img.png']);
    expect(row.contentVariants).toEqual({ linkedin: 'LinkedIn version' });
  });

  it('forces expiresAt=null even if options had it set', async () => {
    const db = makeMockDb();
    const svc = makeService(db);
    // expiresAt is not in SeedEvergreenOptions — the service hardcodes null.
    const row = await svc.seedEvergreen(ORG, PLATFORM, 'Content');
    expect(row.expiresAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// poolSize
// ---------------------------------------------------------------------------

describe('EvergreenPoolService.poolSize', () => {
  it('returns 0 for an empty pool', async () => {
    const db = makeMockDb();
    const svc = makeService(db);
    expect(await svc.poolSize(ORG, PLATFORM)).toBe(0);
  });

  it('counts PENDING evergreen rows', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING },
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING },
    ]);
    const svc = makeService(db);
    expect(await svc.poolSize(ORG, PLATFORM)).toBe(2);
  });

  it('does not count RESERVED or PUBLISHED evergreen rows', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING },
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.RESERVED },
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PUBLISHED },
    ]);
    const svc = makeService(db);
    expect(await svc.poolSize(ORG, PLATFORM)).toBe(1);
  });

  it('does not count regular (non-evergreen) candidates', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'copywriter_agent', status: ApPostCandidateStatus.PENDING },
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING },
    ]);
    const svc = makeService(db);
    expect(await svc.poolSize(ORG, PLATFORM)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pickFallback
// ---------------------------------------------------------------------------

describe('EvergreenPoolService.pickFallback', () => {
  it('returns null when pool is empty', async () => {
    const db = makeMockDb();
    const svc = makeService(db);
    expect(await svc.pickFallback(ORG, PLATFORM)).toBeNull();
  });

  it('returns null when all evergreen items are already RESERVED', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.RESERVED },
    ]);
    const svc = makeService(db);
    expect(await svc.pickFallback(ORG, PLATFORM)).toBeNull();
  });

  it('returns a RESERVED candidate when pool has one item', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING, content: 'fallback post' },
    ]);
    const svc = makeService(db);

    const result = await svc.pickFallback(ORG, PLATFORM);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(ApPostCandidateStatus.RESERVED);
    expect(result!.source).toBe('evergreen');
    expect(result!.content).toBe('fallback post');
  });

  it('keeps pool size constant by creating a clone', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING, content: 'fallback post' },
    ]);
    const svc = makeService(db);

    const sizeBefore = await svc.poolSize(ORG, PLATFORM);
    await svc.pickFallback(ORG, PLATFORM);
    const sizeAfter = await svc.poolSize(ORG, PLATFORM);

    expect(sizeBefore).toBe(1);
    expect(sizeAfter).toBe(1); // RESERVED original replaced by fresh PENDING clone
  });

  it('clone has same content as the original', async () => {
    const db = makeMockDb([
      {
        organizationId: ORG,
        platform: PLATFORM,
        source: 'evergreen',
        status: ApPostCandidateStatus.PENDING,
        content: 'Keep this content',
        contentVariants: { linkedin: 'li variant' },
        mediaUrls: ['https://img.example.com/1.png'],
      },
    ]);
    const svc = makeService(db);

    await svc.pickFallback(ORG, PLATFORM);

    // The new PENDING clone should exist
    const pendingRows = (db._rows as Row[]).filter(
      (r) => r.source === 'evergreen' && r.status === ApPostCandidateStatus.PENDING,
    );
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].content).toBe('Keep this content');
    expect(pendingRows[0].contentVariants).toEqual({ linkedin: 'li variant' });
    expect(pendingRows[0].mediaUrls).toEqual(['https://img.example.com/1.png']);
  });

  it('picks the oldest evergreen candidate first', async () => {
    const now = Date.now();
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING, content: 'newer', createdAt: new Date(now + 5000) },
      { organizationId: ORG, platform: PLATFORM, source: 'evergreen', status: ApPostCandidateStatus.PENDING, content: 'older', createdAt: new Date(now) },
    ]);
    const svc = makeService(db);

    const result = await svc.pickFallback(ORG, PLATFORM);
    expect(result!.content).toBe('older');
  });

  it('does not pick regular (non-evergreen) candidates as fallback', async () => {
    const db = makeMockDb([
      { organizationId: ORG, platform: PLATFORM, source: 'copywriter_agent', status: ApPostCandidateStatus.PENDING, content: 'regular post' },
    ]);
    const svc = makeService(db);

    expect(await svc.pickFallback(ORG, PLATFORM)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: popTop prefers regular candidates over evergreen (priority=-1)
// ---------------------------------------------------------------------------

describe('popTop priority interaction with evergreen candidates', () => {
  it('pops a regular candidate (priority 0) before an evergreen (priority -1)', async () => {
    const now = Date.now();
    const db = makeMockDb([
      {
        organizationId: ORG,
        platform: PLATFORM,
        source: 'copywriter_agent',
        status: ApPostCandidateStatus.PENDING,
        priority: 0,
        content: 'regular post',
        createdAt: new Date(now),
      },
      {
        organizationId: ORG,
        platform: PLATFORM,
        source: 'evergreen',
        status: ApPostCandidateStatus.PENDING,
        priority: -1,
        content: 'evergreen fallback',
        createdAt: new Date(now - 5000), // older but lower priority
      },
    ]);

    const row = await popTop(db, ORG, PLATFORM);
    expect(row!.content).toBe('regular post');
  });

  it('pops evergreen (priority -1) when it is the only available candidate', async () => {
    const db = makeMockDb([
      {
        organizationId: ORG,
        platform: PLATFORM,
        source: 'evergreen',
        status: ApPostCandidateStatus.PENDING,
        priority: -1,
        content: 'only evergreen',
      },
    ]);

    const row = await popTop(db, ORG, PLATFORM);
    expect(row!.content).toBe('only evergreen');
  });
});
