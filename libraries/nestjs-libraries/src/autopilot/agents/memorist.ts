/**
 * Memorist agent — slice 1.7
 *
 * Processes a batch of chat turns or event payloads and decides per entry:
 *   store  — worth memorising; write to vector memory
 *   skip   — ephemeral or redundant; discard
 *   update — supersedes existing knowledge; write a new vector row
 *
 * "Update" semantics: the memory service has no update-in-place for vector
 * rows (pgvector does not support mutating embeddings).  An `update` decision
 * results in a fresh row being inserted.  Semantic search naturally prefers
 * fresher content; explicit deduplication is a future enhancement.
 *
 * Dependencies (all verified against actual source before writing):
 *   writeVector(db, tenantId, entry)  — memory/index.ts
 *   AgentDefinition, AgentContext     — agents/types.ts
 *   ApMemoryVectorKind                — @prisma/client (re-exported from memory/index.ts)
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { writeVector, ApMemoryVectorKind, type MemoryKind } from '../memory';
import type { AgentDefinition, AgentContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemoryTurn {
  /** Speaker role. */
  role: 'user' | 'assistant' | 'system';
  /** Raw message content. */
  content: string;
  /** Optional metadata forwarded to the vector row's sourceRef field. */
  metadata?: Record<string, unknown>;
}

export type MemoryDecisionAction = 'store' | 'skip' | 'update';

export interface MemoryDecision {
  /** Zero-based index into the input `turns` array. */
  index: number;
  action: MemoryDecisionAction;
  /** Memory category — required for store/update, absent for skip. */
  kind?: MemoryKind;
  /**
   * Distilled content to store.  The LLM may paraphrase or summarise the
   * turn rather than storing it verbatim.  Absent for skip.
   */
  content?: string;
}

export interface MemoristInput {
  turns: MemoryTurn[];
}

export interface MemoristOutput {
  decisions: MemoryDecision[];
  /** Number of turns actually written to vector memory. */
  stored: number;
}

// ---------------------------------------------------------------------------
// LLM output schema
// ---------------------------------------------------------------------------

const KIND_VALUES = Object.values(ApMemoryVectorKind) as [string, ...string[]];

const decisionSchema = z.object({
  decisions: z.array(
    z.object({
      index: z
        .number()
        .int()
        .describe('Zero-based index of the turn in the input batch'),
      action: z
        .enum(['store', 'skip', 'update'])
        .describe('Whether and how to memorise this turn'),
      kind: z
        .enum(KIND_VALUES as [MemoryKind, ...MemoryKind[]])
        .optional()
        .describe(
          'Memory category — required when action is store or update',
        ),
      content: z
        .string()
        .optional()
        .describe(
          'Concise, self-contained sentence to store. Paraphrase if helpful. Required when action is store or update.',
        ),
    }),
  ),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const KIND_GUIDE = [
  'ANECDOTE       — a specific incident, example, or story the user shared',
  'MILESTONE      — a business goal, achievement, or upcoming event',
  'BRAND_RULE     — a brand voice, tone, or stylistic constraint',
  'LEARNING       — an insight derived from analytics or past performance',
  'COMPETITOR     — information about a competitor or the market landscape',
  'PERSONAL_STORY — a personal background detail the user shared about themselves',
].join('\n  ');

const MEMORIST_SYSTEM_PROMPT = `\
You are a memory-curation agent for a social-media autopilot product.

You receive a numbered batch of chat turns (USER / ASSISTANT / SYSTEM).
For EACH turn decide:

  store  — the turn contains lasting, reusable information about the user's business or strategy
  skip   — ephemeral, confirmatory, or already captured in another turn of this batch
  update — supersedes or refines something that was likely stored previously

When action = store or update, also output:
  kind    — one of:
  ${KIND_GUIDE}
  content — a concise, self-contained sentence capturing what to remember
             (paraphrase; strip filler like "okay", "got it", "sure")

Output a JSON object with a "decisions" array: one entry per input turn,
same order, same count as the input.`;

// ---------------------------------------------------------------------------
// Core logic (exported for unit-testing without the AgentDefinition wrapper)
// ---------------------------------------------------------------------------

export async function runMemorist(
  ctx: AgentContext,
  input: MemoristInput,
): Promise<MemoristOutput> {
  if (input.turns.length === 0) {
    return { decisions: [], stored: 0 };
  }

  const turnsText = input.turns
    .map((t, i) => `[${i}] ${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');

  const { object } = await generateObject({
    model: ctx.llm.model,
    schema: decisionSchema,
    prompt: turnsText,
    system: MEMORIST_SYSTEM_PROMPT,
  });

  const decisions: MemoryDecision[] = object.decisions.map((d) => ({
    index: d.index,
    action: d.action as MemoryDecisionAction,
    kind: d.kind as MemoryKind | undefined,
    content: d.content,
  }));

  // Write entries for store + update decisions that have both kind and content.
  const storeable = decisions.filter(
    (d): d is MemoryDecision & { kind: MemoryKind; content: string } =>
      d.action !== 'skip' && d.kind !== undefined && d.content !== undefined,
  );

  await Promise.all(
    storeable.map((d) => {
      const turn = input.turns[d.index];
      return writeVector(ctx.db as PrismaClient, ctx.tenant.id, {
        kind: d.kind,
        content: d.content,
        sourceRef: turn?.metadata,
      });
    }),
  );

  return { decisions, stored: storeable.length };
}

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

export const memoristAgent: AgentDefinition<MemoristInput, MemoristOutput> = {
  id: 'memorist',
  systemPrompt: MEMORIST_SYSTEM_PROMPT,
  allowedSkills: [],
  run: runMemorist,
};

export default memoristAgent;
