import { push, popTop, expire, depth, ApPostCandidateStatus } from './index';

// ---------------------------------------------------------------------------
// In-memory mock
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
  return `row-${++_idCounter}`;
}

/**
 * Builds a minimal mock of the Prisma client scoped to apPostCandidate.
 * The $transaction callback receives the same mock, matching the real
 * Prisma interactive-transaction contract.
 */
function makeMockDb(initial: Partial<Row>[] = []) {
  const rows: Row[] = initial.map((r, i) => ({
    id: r.id ?? nextId(),
    organizationId: r.organizationId ?? 'tenant-1',
    platform: r.platform ?? 'twitter',
    content: r.content ?? 'default content',
    contentVariants: r.contentVariants ?? {},
    mediaUrls: r.mediaUrls ?? [],
    status: r.status ?? ApPostCandidateStatus.PENDING,
    priority: r.priority ?? 0,
    source: r.source ?? 'unknown',
    expiresAt: r.expiresAt ?? null,
    metadata: r.metadata ?? {},
    createdAt: r.createdAt ?? new Date(Date.now() + i * 1000),
    updatedAt: r.updatedAt ?? new Date(),
  }));

  const candidate = {
    async create({ data }: any): Promise<Row> {
      const row: Row = {
        id: nextId(),
        organizationId: data.organizationId,
        platform: data.platform,
        content: data.content,
        contentVariants: data.contentVariants ?? {},
        mediaUrls: data.mediaUrls ?? [],
        status: data.status ?? ApPostCandidateStatus.PENDING,
        priority: data.priority ?? 0,
        source: data.source ?? 'unknown',
        expiresAt: data.expiresAt ?? null,
        metadata: data.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return row;
    },

    async update({ where, data }: any): Promise<Row> {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`row ${where.id} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },

    async updateMany({ where, data }: any): Promise<{ count: number }> {
      let count = 0;
      const now = new Date();
      for (const row of rows) {
        if (where.organizationId && row.organizationId !== where.organizationId) continue;
        if (where.status && row.status !== where.status) continue;
        if (where.expiresAt?.lt && (row.expiresAt === null || row.expiresAt >= now)) continue;
        Object.assign(row, data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    },

    async count({ where }: any): Promise<number> {
      const now = new Date();
      return rows.filter((row) => {
        if (where.organizationId && row.organizationId !== where.organizationId) return false;
        if (where.platform && row.platform !== where.platform) return false;
        if (where.status && row.status !== where.status) return false;
        // OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        if (where.OR) {
          const notExpired =
            row.expiresAt === null || row.expiresAt > now;
          if (!notExpired) return false;
        }
        return true;
      }).length;
    },
  };

  // $queryRaw mock — used by popTop to SELECT FOR UPDATE SKIP LOCKED.
  // We simulate the lock by finding the best eligible row ourselves.
  async function $queryRaw<T>(strings: any, ...values: any[]): Promise<T> {
    const [tenantId, platform] = values as [string, string];
    const now = new Date();
    const eligible = rows
      .filter(
        (r) =>
          r.organizationId === tenantId &&
          r.platform === platform &&
          r.status === ApPostCandidateStatus.PENDING &&
          (r.expiresAt === null || r.expiresAt > now)
      )
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    if (eligible.length === 0) return [] as unknown as T;
    return [{ id: eligible[0].id }] as unknown as T;
  }

  return {
    apPostCandidate: candidate,
    $queryRaw,
    async $transaction(fn: (tx: any) => Promise<any>) {
      return fn({
        apPostCandidate: candidate,
        $queryRaw,
      });
    },
    _rows: rows,
  } as any;
}

const TENANT = 'tenant-1';
const PLATFORM = 'twitter';

beforeEach(() => {
  _idCounter = 0;
});

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

describe('push', () => {
  it('creates a PENDING candidate with default options', async () => {
    const db = makeMockDb();
    const row = await push(db, TENANT, PLATFORM, 'Hello world');
    expect(row.organizationId).toBe(TENANT);
    expect(row.platform).toBe(PLATFORM);
    expect(row.content).toBe('Hello world');
    expect(row.status).toBe(ApPostCandidateStatus.PENDING);
    expect(row.priority).toBe(0);
    expect(row.source).toBe('unknown');
    expect(row.expiresAt).toBeNull();
  });

  it('stores provided options on the row', async () => {
    const db = makeMockDb();
    const exp = new Date(Date.now() + 86400_000);
    const row = await push(db, TENANT, PLATFORM, 'content', {
      priority: 5,
      source: 'copywriter_agent',
      expiresAt: exp,
      mediaUrls: ['https://example.com/img.png'],
      contentVariants: { linkedin: 'alt text' },
      metadata: { topicId: 'abc' },
    });
    expect(row.priority).toBe(5);
    expect(row.source).toBe('copywriter_agent');
    expect(row.expiresAt).toEqual(exp);
  });
});

// ---------------------------------------------------------------------------
// depth
// ---------------------------------------------------------------------------

describe('depth', () => {
  it('returns 0 for an empty stack', async () => {
    const db = makeMockDb();
    expect(await depth(db, TENANT)).toBe(0);
  });

  it('counts PENDING non-expired rows', async () => {
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.RESERVED },
    ]);
    expect(await depth(db, TENANT)).toBe(2);
  });

  it('narrows by platform when provided', async () => {
    const db = makeMockDb([
      { organizationId: TENANT, platform: 'twitter', status: ApPostCandidateStatus.PENDING },
      { organizationId: TENANT, platform: 'linkedin', status: ApPostCandidateStatus.PENDING },
    ]);
    expect(await depth(db, TENANT, 'linkedin')).toBe(1);
  });

  it('excludes expired candidates from count', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING },
    ]);
    expect(await depth(db, TENANT)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// popTop
// ---------------------------------------------------------------------------

describe('popTop', () => {
  it('returns null for an empty stack', async () => {
    const db = makeMockDb();
    expect(await popTop(db, TENANT, PLATFORM)).toBeNull();
  });

  it('returns the single PENDING candidate and marks it RESERVED', async () => {
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'post-1' },
    ]);
    const row = await popTop(db, TENANT, PLATFORM);
    expect(row).not.toBeNull();
    expect(row!.content).toBe('post-1');
    expect(row!.status).toBe(ApPostCandidateStatus.RESERVED);
  });

  it('picks the highest-priority candidate first', async () => {
    const now = Date.now();
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'low', priority: 0, createdAt: new Date(now) },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'high', priority: 10, createdAt: new Date(now + 1000) },
    ]);
    const row = await popTop(db, TENANT, PLATFORM);
    expect(row!.content).toBe('high');
  });

  it('among equal priority picks the oldest (FIFO)', async () => {
    const now = Date.now();
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'newer', priority: 1, createdAt: new Date(now + 2000) },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'older', priority: 1, createdAt: new Date(now) },
    ]);
    const row = await popTop(db, TENANT, PLATFORM);
    expect(row!.content).toBe('older');
  });

  it('skips expired candidates', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'expired', expiresAt: past },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, content: 'valid' },
    ]);
    const row = await popTop(db, TENANT, PLATFORM);
    expect(row!.content).toBe('valid');
  });

  it('returns null when all candidates are expired', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
    ]);
    expect(await popTop(db, TENANT, PLATFORM)).toBeNull();
  });

  it('does not pop already RESERVED rows', async () => {
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.RESERVED },
    ]);
    expect(await popTop(db, TENANT, PLATFORM)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// expire
// ---------------------------------------------------------------------------

describe('expire', () => {
  it('returns 0 when there are no stale rows', async () => {
    const future = new Date(Date.now() + 86400_000);
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: future },
    ]);
    expect(await expire(db, TENANT)).toBe(0);
  });

  it('marks stale PENDING rows as EXPIRED and returns count', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: null },
    ]);
    const count = await expire(db, TENANT);
    expect(count).toBe(2);
    const statuses = (db._rows as Row[]).map((r) => r.status);
    expect(statuses.filter((s) => s === ApPostCandidateStatus.EXPIRED)).toHaveLength(2);
    expect(statuses.filter((s) => s === ApPostCandidateStatus.PENDING)).toHaveLength(1);
  });

  it('does not expire RESERVED or PUBLISHED rows', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.RESERVED, expiresAt: past },
      { organizationId: TENANT, platform: PLATFORM, status: ApPostCandidateStatus.PUBLISHED, expiresAt: past },
    ]);
    expect(await expire(db, TENANT)).toBe(0);
  });

  it('scopes to tenant when tenantId is provided', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: 'tenant-A', platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
      { organizationId: 'tenant-B', platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
    ]);
    const count = await expire(db, 'tenant-A');
    expect(count).toBe(1);
    const tenantB = (db._rows as Row[]).find((r) => r.organizationId === 'tenant-B')!;
    expect(tenantB.status).toBe(ApPostCandidateStatus.PENDING);
  });

  it('runs globally when tenantId is omitted', async () => {
    const past = new Date(Date.now() - 1000);
    const db = makeMockDb([
      { organizationId: 'tenant-A', platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
      { organizationId: 'tenant-B', platform: PLATFORM, status: ApPostCandidateStatus.PENDING, expiresAt: past },
    ]);
    expect(await expire(db)).toBe(2);
  });
});
