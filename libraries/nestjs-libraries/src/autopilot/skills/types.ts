import { Organization, PrismaClient, User } from '@prisma/client';
import type { LanguageModel } from 'ai-v5';

// ---------------------------------------------------------------------------
// SkillId
// ---------------------------------------------------------------------------

/** Opaque string identifier for a skill (e.g. "push_to_stack", "generate_copy"). */
export type SkillId = string;

// ---------------------------------------------------------------------------
// Supporting interfaces
// ---------------------------------------------------------------------------

/**
 * Minimal logger surface passed into every skill handler.
 * Compatible with NestJS LoggerService — swap in the real one at wire-up time.
 */
export interface SkillLogger {
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}

/** Options accepted by the convenience complete() method. */
export interface LlmCompleteOptions {
  system?: string;
  /** Maximum tokens to generate (maps to ai-v5 maxOutputTokens). */
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * Thin LLM provider abstraction backed by the Vercel AI SDK.
 * Implemented in autopilot/llm.ts (slice 0.16).
 *
 * - `model`    — raw Vercel AI SDK LanguageModel; use directly for streaming or tool-calling.
 * - `complete` — convenience wrapper: single-turn text completion, no streaming.
 */
export interface LlmProvider {
  /** The underlying Vercel AI SDK model handle. */
  model: LanguageModel;
  /** Simple single-turn text completion (no streaming, no tools). */
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<string>;
}

// ---------------------------------------------------------------------------
// SkillContext
// ---------------------------------------------------------------------------

/**
 * Runtime context injected into every skill handler.
 * Mirrors the fields available on an authenticated NestJS request
 * (req.org → tenant, req.user → user) plus db, llm, and logger.
 */
export interface SkillContext {
  /** The requesting organisation (tenant). Equivalent to req.org. */
  tenant: Organization;
  /** The authenticated user. Equivalent to req.user. */
  user: User;
  /** Prisma client — use for all DB access inside skills. */
  db: PrismaClient;
  /** LLM provider helper — never call a provider directly; go through this. */
  llm: LlmProvider;
  /** Scoped logger for structured output. */
  logger: SkillLogger;
}

// ---------------------------------------------------------------------------
// SkillHandler
// ---------------------------------------------------------------------------

/** A callable that performs one skill and returns a typed result. */
export type SkillHandler<Input = unknown, Output = unknown> = (
  ctx: SkillContext,
  input: Input
) => Promise<Output>;

// ---------------------------------------------------------------------------
// SkillEntry
// ---------------------------------------------------------------------------

/** Registry entry for a single skill. One file per skill exports one of these. */
export interface SkillEntry<Input = unknown, Output = unknown> {
  /** Must match the key used in SKILL_REGISTRY. */
  id: SkillId;
  /** Human-readable description used in system prompts and admin UI. */
  description: string;
  /** The implementation. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: SkillHandler<Input, Output>;
}

// ---------------------------------------------------------------------------
// SkillRegistry
// ---------------------------------------------------------------------------

/**
 * Central map of all registered skills.
 * Keyed by SkillId; values are SkillEntry with any Input/Output because
 * the registry is heterogeneous — callers narrow types before invoking.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SkillRegistry = Record<SkillId, SkillEntry<any, any>>;
