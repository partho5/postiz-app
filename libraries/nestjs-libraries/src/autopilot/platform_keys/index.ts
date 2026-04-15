import { PrismaClient, Prisma } from '@prisma/client';
import { encrypt, decrypt } from '../encryption';

/**
 * Upserts the encrypted secret for a platform within a tenant.
 * Any existing row for (tenantId, platform) is replaced.
 */
export async function set(
  db: PrismaClient,
  tenantId: string,
  platform: string,
  plaintext: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  const secretEncrypted = encrypt(plaintext);
  const metaJson = meta as Prisma.InputJsonValue;
  await db.apPlatformKey.upsert({
    where: { organizationId_platform: { organizationId: tenantId, platform } },
    create: { organizationId: tenantId, platform, secretEncrypted, meta: metaJson },
    update: { secretEncrypted, meta: metaJson, updatedAt: new Date() },
  });
}

/**
 * Returns the decrypted secret for a platform, or null if not found.
 */
export async function get(
  db: PrismaClient,
  tenantId: string,
  platform: string
): Promise<string | null> {
  const row = await db.apPlatformKey.findUnique({
    where: { organizationId_platform: { organizationId: tenantId, platform } },
    select: { secretEncrypted: true },
  });
  if (!row) return null;
  return decrypt(row.secretEncrypted);
}

/**
 * Deletes the platform key for a tenant. No-op if the row does not exist.
 */
export async function del(
  db: PrismaClient,
  tenantId: string,
  platform: string
): Promise<void> {
  await db.apPlatformKey.deleteMany({
    where: { organizationId: tenantId, platform },
  });
}
