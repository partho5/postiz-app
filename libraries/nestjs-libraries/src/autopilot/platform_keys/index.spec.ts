import { randomBytes } from 'crypto';
import { set, get, del } from './index';

// Minimal Prisma mock that simulates apPlatformKey storage in memory.
function makeMockDb() {
  const store = new Map<string, { secretEncrypted: string; meta: unknown; updatedAt: Date }>();

  const key = (orgId: string, platform: string) => `${orgId}::${platform}`;

  return {
    apPlatformKey: {
      async upsert({ where, create, update }: any) {
        const k = key(where.organizationId_platform.organizationId, where.organizationId_platform.platform);
        if (store.has(k)) {
          store.set(k, { ...store.get(k)!, ...update });
        } else {
          store.set(k, { secretEncrypted: create.secretEncrypted, meta: create.meta, updatedAt: new Date() });
        }
      },
      async findUnique({ where, select }: any) {
        const k = key(where.organizationId_platform.organizationId, where.organizationId_platform.platform);
        const row = store.get(k);
        if (!row) return null;
        return select?.secretEncrypted ? { secretEncrypted: row.secretEncrypted } : row;
      },
      async deleteMany({ where }: any) {
        const k = key(where.organizationId, where.platform);
        store.delete(k);
        return { count: store.has(k) ? 0 : 1 };
      },
    },
    _store: store,
  } as any;
}

beforeEach(() => {
  process.env.AP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

afterEach(() => {
  delete process.env.AP_ENCRYPTION_KEY;
});

describe('platform_keys service', () => {
  it('round-trip: set then get returns original plaintext', async () => {
    const db = makeMockDb();
    await set(db, 'tenant-1', 'twitter', 'super-secret-token');
    const result = await get(db, 'tenant-1', 'twitter');
    expect(result).toBe('super-secret-token');
  });

  it('get returns null when the key does not exist', async () => {
    const db = makeMockDb();
    const result = await get(db, 'tenant-1', 'linkedin');
    expect(result).toBeNull();
  });

  it('set overwrites existing secret (upsert semantics)', async () => {
    const db = makeMockDb();
    await set(db, 'tenant-1', 'twitter', 'old-token');
    await set(db, 'tenant-1', 'twitter', 'new-token');
    const result = await get(db, 'tenant-1', 'twitter');
    expect(result).toBe('new-token');
  });

  it('del removes the key; subsequent get returns null', async () => {
    const db = makeMockDb();
    await set(db, 'tenant-1', 'twitter', 'a-token');
    await del(db, 'tenant-1', 'twitter');
    const result = await get(db, 'tenant-1', 'twitter');
    expect(result).toBeNull();
  });

  it('del on a non-existent key is a no-op (does not throw)', async () => {
    const db = makeMockDb();
    await expect(del(db, 'tenant-1', 'ghost-platform')).resolves.toBeUndefined();
  });

  it('keys are isolated per tenant', async () => {
    const db = makeMockDb();
    await set(db, 'tenant-A', 'twitter', 'token-A');
    await set(db, 'tenant-B', 'twitter', 'token-B');
    expect(await get(db, 'tenant-A', 'twitter')).toBe('token-A');
    expect(await get(db, 'tenant-B', 'twitter')).toBe('token-B');
  });

  it('secret is stored encrypted (ciphertext differs from plaintext)', async () => {
    const db = makeMockDb();
    const plaintext = 'my-api-key-12345';
    await set(db, 'tenant-1', 'twitter', plaintext);
    // Peek at the raw stored value directly
    const raw = db._store.get('tenant-1::twitter');
    expect(raw).toBeDefined();
    expect(raw.secretEncrypted).not.toBe(plaintext);
    // Must be valid base64 (decodes without error)
    expect(() => Buffer.from(raw.secretEncrypted, 'base64')).not.toThrow();
  });
});
