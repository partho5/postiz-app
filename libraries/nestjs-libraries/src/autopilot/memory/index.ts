/**
 * Memory read/write service — slice 1.6
 *
 * Provides two layers of memory for a tenant:
 *
 *   Structured memory
 *   -----------------
 *   getStructuredProfile(db, tenantId)
 *     Returns the tenant's ApBusinessProfile + all active ApGrowthRules.
 *     This is a cheap DB read — no embedding needed.
 *
 *   Vector memory
 *   -------------
 *   writeVector(db, tenantId, entry)
 *     Embeds `entry.content`, inserts into ap_memory_vector.
 *
 *   queryVector(db, tenantId, queryText, topK, kinds?)
 *     Embeds queryText then performs a cosine-distance nearest-neighbour
 *     search scoped to the tenant (and optionally filtered by kind).
 *     Returns rows ordered by similarity (most similar first).
 *
 *   listRecent(db, tenantId, kind, limit)
 *     Returns the N most-recently created vector memories of a given kind
 *     (no embedding required).
 *
 *   ensureVectorIndex(db)
 *     Creates the IVFFLAT index on ap_memory_vector.embedding if it is
 *     missing.  Requires at least one row (pgvector warns but still creates
 *     with zero rows).  Should be called once on autopilot module init.
 *
 * Raw SQL notes
 * -------------
 *   • The embedding column is typed Unsupported("vector(1536)") in Prisma, so
 *     all INSERT and SELECT on that column use $queryRaw / $executeRaw.
 *   • The pgvector <=> operator computes cosine distance (lower = more similar).
 *   • Prisma Sql template tags (Prisma.sql) are used for parameterisation;
 *     the embedding array literal is cast explicitly to vector.
 */

import { PrismaClient, Prisma, ApMemoryVectorKind } from '@prisma/client';
import { embedText } from '../llm';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MemoryKind = ApMemoryVectorKind;
export { ApMemoryVectorKind };

export interface VectorMemoryEntry {
  kind: MemoryKind;
  content: string;
  /** Optional back-reference (e.g. { messageId, source }). */
  sourceRef?: Record<string, unknown>;
  /** TTL in days — null means no expiry. */
  freshnessTtlDays?: number | null;
}

export interface VectorMemoryRow {
  id: string;
  organizationId: string;
  kind: MemoryKind;
  content: string;
  sourceRef: Record<string, unknown> | null;
  freshnessTtlDays: number | null;
  createdAt: Date;
  /** Cosine similarity score [0, 1]. 1 = identical. Only present on queryVector results. */
  similarity?: number;
}

export interface StructuredProfile {
  businessProfile: {
    id: string;
    niche: string;
    goals: unknown;
    brandVoiceShort: string;
    brandVoiceExtended: string;
    antiPatterns: unknown;
    regulatoryFlags: unknown;
    updatedAt: Date;
    updatedBy: string;
  } | null;
  growthRules: Array<{
    id: string;
    ruleKey: string;
    ruleValue: unknown;
    active: boolean;
    source: string;
    updatedAt: Date;
  }>;
}

// ---------------------------------------------------------------------------
// Internal raw-query row shapes
// ---------------------------------------------------------------------------

interface RawVectorRow {
  id: string;
  organizationId: string;
  kind: string;
  content: string;
  sourceRef: Record<string, unknown> | null;
  freshnessTtlDays: number | null;
  createdAt: Date;
  distance?: string; // pgvector returns distance as text in some drivers
}

// ---------------------------------------------------------------------------
// getStructuredProfile
// ---------------------------------------------------------------------------

/**
 * Return the tenant's business profile and active growth rules.
 * Fast: no embedding required.
 */
export async function getStructuredProfile(
  db: PrismaClient,
  tenantId: string,
): Promise<StructuredProfile> {
  const [profile, rules] = await Promise.all([
    db.apBusinessProfile.findUnique({
      where: { organizationId: tenantId },
    }),
    db.apGrowthRule.findMany({
      where: { organizationId: tenantId, active: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return {
    businessProfile: profile
      ? {
          id: profile.id,
          niche: profile.niche,
          goals: profile.goals,
          brandVoiceShort: profile.brandVoiceShort,
          brandVoiceExtended: profile.brandVoiceExtended,
          antiPatterns: profile.antiPatterns,
          regulatoryFlags: profile.regulatoryFlags,
          updatedAt: profile.updatedAt,
          updatedBy: profile.updatedBy,
        }
      : null,
    growthRules: rules.map((r) => ({
      id: r.id,
      ruleKey: r.ruleKey,
      ruleValue: r.ruleValue,
      active: r.active,
      source: r.source,
      updatedAt: r.updatedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// writeVector
// ---------------------------------------------------------------------------

/**
 * Embed `entry.content` and persist it to ap_memory_vector.
 * Returns the new row id.
 */
export async function writeVector(
  db: PrismaClient,
  tenantId: string,
  entry: VectorMemoryEntry,
): Promise<string> {
  const embedding = await embedText(entry.content);
  const embeddingLiteral = `[${embedding.join(',')}]`;
  const id = crypto.randomUUID();

  await db.$executeRaw`
    INSERT INTO ap_memory_vector
      (id, "organizationId", kind, content, embedding, "sourceRef", "freshnessTtlDays", "createdAt")
    VALUES (
      ${id},
      ${tenantId},
      ${entry.kind}::"ApMemoryVectorKind",
      ${entry.content},
      ${embeddingLiteral}::vector,
      ${entry.sourceRef ? JSON.stringify(entry.sourceRef) : null}::jsonb,
      ${entry.freshnessTtlDays ?? null},
      NOW()
    )
  `;

  return id;
}

// ---------------------------------------------------------------------------
// queryVector
// ---------------------------------------------------------------------------

/**
 * Semantic nearest-neighbour search.
 * Embeds `queryText` then returns the top-K most similar memories for the
 * tenant, ordered by cosine similarity (highest first).
 *
 * @param kinds  Optional whitelist of kinds to restrict results.
 */
export async function queryVector(
  db: PrismaClient,
  tenantId: string,
  queryText: string,
  topK: number,
  kinds?: MemoryKind[],
): Promise<VectorMemoryRow[]> {
  const embedding = await embedText(queryText);
  const embeddingLiteral = `[${embedding.join(',')}]`;

  let rows: RawVectorRow[];

  if (kinds && kinds.length > 0) {
    // Prisma raw doesn't support array literals cleanly; use explicit IN cast.
    const kindLiterals = kinds
      .map((k) => `'${k}'::"ApMemoryVectorKind"`)
      .join(', ');

    rows = await db.$queryRaw<RawVectorRow[]>`
      SELECT
        id,
        "organizationId",
        kind::text,
        content,
        "sourceRef",
        "freshnessTtlDays",
        "createdAt",
        (1 - (embedding <=> ${embeddingLiteral}::vector)) AS distance
      FROM ap_memory_vector
      WHERE "organizationId" = ${tenantId}
        AND kind IN (${Prisma.raw(kindLiterals)})
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT ${topK}
    `;
  } else {
    rows = await db.$queryRaw<RawVectorRow[]>`
      SELECT
        id,
        "organizationId",
        kind::text,
        content,
        "sourceRef",
        "freshnessTtlDays",
        "createdAt",
        (1 - (embedding <=> ${embeddingLiteral}::vector)) AS distance
      FROM ap_memory_vector
      WHERE "organizationId" = ${tenantId}
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT ${topK}
    `;
  }

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    kind: r.kind as MemoryKind,
    content: r.content,
    sourceRef: r.sourceRef,
    freshnessTtlDays: r.freshnessTtlDays,
    createdAt: r.createdAt,
    similarity: r.distance !== undefined ? parseFloat(String(r.distance)) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// listRecent
// ---------------------------------------------------------------------------

/**
 * Return the N most-recently created vector memories of a given kind.
 * No embedding required — pure ORM query.
 */
export async function listRecent(
  db: PrismaClient,
  tenantId: string,
  kind: MemoryKind,
  limit: number,
): Promise<VectorMemoryRow[]> {
  // ap_memory_vector has Unsupported("vector") so we use raw SQL to avoid
  // Prisma selecting the embedding column (which it can't deserialise).
  const rows = await db.$queryRaw<RawVectorRow[]>`
    SELECT
      id,
      "organizationId",
      kind::text,
      content,
      "sourceRef",
      "freshnessTtlDays",
      "createdAt"
    FROM ap_memory_vector
    WHERE "organizationId" = ${tenantId}
      AND kind = ${kind}::"ApMemoryVectorKind"
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    kind: r.kind as MemoryKind,
    content: r.content,
    sourceRef: r.sourceRef,
    freshnessTtlDays: r.freshnessTtlDays,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// ensureVectorIndex
// ---------------------------------------------------------------------------

/**
 * Create the IVFFLAT cosine-distance index on ap_memory_vector.embedding if
 * it is absent.  Call once during autopilot module initialisation.
 *
 * Requires the vector extension to be enabled (handled at DB setup time by a
 * superuser).  Emits a notice when created with few rows (pgvector default).
 */
export async function ensureVectorIndex(db: PrismaClient): Promise<void> {
  await db.$executeRaw`
    CREATE INDEX IF NOT EXISTS ap_memory_vector_embedding_ivfflat_idx
    ON ap_memory_vector
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `;
}
