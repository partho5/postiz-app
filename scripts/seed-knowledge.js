'use strict';
/**
 * seed-knowledge.js — build-time knowledge base embedder
 *
 * Reads every .md file in <repo-root>/knowledge/, splits each file into
 * chunks on "## " section headings, hashes each chunk, skips chunks whose
 * hash hasn't changed in the DB, embeds the rest via OpenAI
 * text-embedding-3-small, and upserts into ap_knowledge_chunk.
 *
 * Exit codes:
 *   0 — success (including "nothing to do")
 *   1 — missing env vars, DB error, or embedding API error
 *
 * Run:
 *   node --require dotenv/config scripts/seed-knowledge.js
 *   pnpm run seed:knowledge
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'knowledge');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const MIN_CHUNK_CHARS = 40; // skip headings with almost no body

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.AP_OPENAI_API_KEY;

if (!DATABASE_URL) {
  console.error('[seed-knowledge] ERROR: DATABASE_URL is not set');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('[seed-knowledge] ERROR: AP_OPENAI_API_KEY is not set');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function info(msg) { console.log(`[seed-knowledge] ${msg}`); }
function warn(msg) { console.warn(`[seed-knowledge] WARN: ${msg}`); }

/** SHA-256 hex of a string. */
function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Split a markdown file into chunks keyed by their ## heading.
 * The content before the first ## becomes a chunk under the file title (# heading).
 * Skips _index.md entirely.
 *
 * Returns: Array<{ heading: string, body: string }>
 */
function chunkMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const chunks = [];
  let currentHeading = null;
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading !== null) {
        chunks.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
      }
      currentHeading = line.replace(/^## /, '').trim();
      currentLines = [];
    } else if (line.startsWith('# ') && currentHeading === null) {
      // File title — use as heading for the intro block
      currentHeading = line.replace(/^# /, '').trim();
    } else {
      currentLines.push(line);
    }
  }

  // Flush last chunk
  if (currentHeading !== null) {
    chunks.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
  }

  return chunks.filter((c) => c.body.length >= MIN_CHUNK_CHARS);
}

// ---------------------------------------------------------------------------
// Embed a batch of texts via OpenAI
// ---------------------------------------------------------------------------

async function embedBatch(openai, texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  // response.data is ordered to match input order
  return response.data.map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// Ensure HNSW index exists (fast for small datasets, no min-rows requirement)
// ---------------------------------------------------------------------------

async function ensureIndex(db) {
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS ap_knowledge_chunk_embedding_hnsw_idx
    ON ap_knowledge_chunk
    USING hnsw (embedding vector_cosine_ops)
  `);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    warn(`knowledge/ directory not found at ${KNOWLEDGE_DIR} — nothing to seed`);
    return;
  }

  const mdFiles = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith('.md') && f !== '_index.md')
    .sort();

  if (mdFiles.length === 0) {
    info('No .md files found in knowledge/ — nothing to seed');
    return;
  }

  info(`Found ${mdFiles.length} knowledge file(s): ${mdFiles.join(', ')}`);

  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    // Fetch all existing hashes keyed by "sourceFile|heading"
    const existing = await db.$queryRawUnsafe(
      `SELECT "sourceFile", heading, "contentHash" FROM ap_knowledge_chunk`
    );
    const hashMap = new Map(
      existing.map((r) => [`${r.sourceFile}|${r.heading}`, r.contentHash])
    );

    const toEmbed = [];

    for (const file of mdFiles) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      const chunks = chunkMarkdown(filePath);

      for (const chunk of chunks) {
        const text = `${chunk.heading}\n\n${chunk.body}`;
        const hash = sha256(text);
        const key = `${file}|${chunk.heading}`;

        if (hashMap.get(key) === hash) {
          info(`  skip  ${file} § "${chunk.heading}" (unchanged)`);
          continue;
        }

        toEmbed.push({ sourceFile: file, heading: chunk.heading, content: text, hash });
      }
    }

    if (toEmbed.length === 0) {
      info('All chunks up-to-date — nothing to embed');
      await ensureIndex(db);
      return;
    }

    info(`Embedding ${toEmbed.length} new/changed chunk(s)...`);

    // Embed in batches of 20 (well within OpenAI's limit)
    const BATCH = 20;
    for (let i = 0; i < toEmbed.length; i += BATCH) {
      const batch = toEmbed.slice(i, i + BATCH);
      const texts = batch.map((c) => c.content);
      const vectors = await embedBatch(openai, texts);

      for (let j = 0; j < batch.length; j++) {
        const { sourceFile, heading, content, hash } = batch[j];
        const embeddingLiteral = `[${vectors[j].join(',')}]`;

        await db.$executeRawUnsafe(`
          INSERT INTO ap_knowledge_chunk
            (id, "sourceFile", heading, content, "contentHash", embedding, "createdAt", "updatedAt")
          VALUES (
            gen_random_uuid(),
            $1, $2, $3, $4,
            $5::vector,
            NOW(), NOW()
          )
          ON CONFLICT ("sourceFile", heading)
          DO UPDATE SET
            content = EXCLUDED.content,
            "contentHash" = EXCLUDED."contentHash",
            embedding = EXCLUDED.embedding,
            "updatedAt" = NOW()
        `, sourceFile, heading, content, hash, embeddingLiteral);

        info(`  upsert ${sourceFile} § "${heading}"`);
      }
    }

    await ensureIndex(db);
    info(`Done. ${toEmbed.length} chunk(s) embedded successfully.`);

  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed-knowledge] FATAL:', err.message ?? err);
  process.exit(1);
});
