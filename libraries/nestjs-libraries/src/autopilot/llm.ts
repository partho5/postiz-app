/**
 * Vercel AI SDK wiring — slice 0.16
 *
 * Reads AP_* env vars at call time (not at import time) so tests can set them
 * before calling selectModel / createLlmProvider.
 *
 * Supported providers and the env var that enables each:
 *   anthropic → AP_ANTHROPIC_API_KEY  (import alias: @ai-sdk/anthropic-v5)
 *   openai    → AP_OPENAI_API_KEY     (import: @ai-sdk/openai)
 *   google    → AP_GOOGLE_API_KEY     (import alias: @ai-sdk/google-v5)
 *
 * All three pnpm aliases resolve to @ai-sdk/* v2 packages (Vercel AI SDK v4).
 */

import { createAnthropic } from '@ai-sdk/anthropic-v5';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google-v5';
import { generateText, embed, type LanguageModel, type EmbeddingModel } from 'ai-v5';
import type { LlmProvider, LlmCompleteOptions } from './skills/types';

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

type ProviderId = 'anthropic' | 'openai' | 'google';

/** Maps a model ID prefix/name to the provider that serves it. */
const MODEL_PROVIDER: Record<string, ProviderId> = {
  // Anthropic Claude
  'claude-opus-4-6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'claude-haiku-4-5-20251001': 'anthropic',
  'claude-3-5-sonnet-20241022': 'anthropic',
  'claude-3-5-haiku-20241022': 'anthropic',
  // OpenAI
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'o3': 'openai',
  'o3-mini': 'openai',
  'o4-mini': 'openai',
  // Google
  'gemini-2.0-flash': 'google',
  'gemini-1.5-pro': 'google',
  'gemini-1.5-flash': 'google',
  'gemini-2.5-pro': 'google',
};

/** Maps a provider to the env var name that holds the API key. */
const PROVIDER_ENV: Record<ProviderId, string> = {
  anthropic: 'AP_ANTHROPIC_API_KEY',
  openai: 'AP_OPENAI_API_KEY',
  google: 'AP_GOOGLE_API_KEY',
};

/**
 * Default model preference list.
 * The first model whose provider has an API key configured is selected.
 */
export const DEFAULT_MODEL_PREFERENCE: string[] = [
  'claude-sonnet-4-6',
  'gpt-4o',
  'gemini-2.0-flash',
];

// ---------------------------------------------------------------------------
// selectModel
// ---------------------------------------------------------------------------

/**
 * Iterate `preferred` in order; return the first LanguageModel whose provider
 * has an API key in the environment.  Returns `null` when no key is available.
 *
 * @example
 *   const model = selectModel(['claude-sonnet-4-6', 'gpt-4o']);
 *   if (!model) throw new Error('No LLM key configured');
 */
export function selectModel(preferred: string[]): LanguageModel | null {
  for (const modelId of preferred) {
    const provider = MODEL_PROVIDER[modelId];
    if (!provider) continue;

    const apiKey = process.env[PROVIDER_ENV[provider]];
    if (!apiKey) continue;

    return buildModel(provider, modelId, apiKey);
  }
  return null;
}

// ---------------------------------------------------------------------------
// createLlmProvider
// ---------------------------------------------------------------------------

/**
 * Build an LlmProvider backed by the first model from `preferred` (default:
 * DEFAULT_MODEL_PREFERENCE) that has a configured API key.
 *
 * Returns `null` when no API key is available so callers can decide whether to
 * skip or throw.
 */
export function createLlmProvider(
  preferred: string[] = DEFAULT_MODEL_PREFERENCE
): LlmProvider | null {
  const model = selectModel(preferred);
  if (!model) return null;

  return {
    model,
    async complete(prompt: string, opts: LlmCompleteOptions = {}): Promise<string> {
      const result = await generateText({
        model,
        prompt,
        system: opts.system,
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
      });
      return result.text;
    },
  };
}

// ---------------------------------------------------------------------------
// Internal: instantiate the correct provider SDK
// ---------------------------------------------------------------------------

function buildModel(
  provider: ProviderId,
  modelId: string,
  apiKey: string
): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
  }
}

// ---------------------------------------------------------------------------
// Embedding support
// ---------------------------------------------------------------------------

/**
 * Default embedding model.  Uses OpenAI text-embedding-3-small (1536 dims)
 * when AP_OPENAI_API_KEY is set; falls back to OpenAI ada-002 for compat.
 * Returns null when no OpenAI key is present.
 *
 * Only OpenAI is supported for embeddings — Anthropic and Google do not
 * expose embedding endpoints through the Vercel AI SDK at this time.
 */
export function selectEmbeddingModel(): EmbeddingModel<string> | null {
  const apiKey = process.env.AP_OPENAI_API_KEY;
  if (!apiKey) return null;
  return createOpenAI({ apiKey }).textEmbedding('text-embedding-3-small');
}

/**
 * Embed a single text string using the default embedding model.
 * Returns a number[] of length 1536, or throws if no model is available.
 */
export async function embedText(text: string): Promise<number[]> {
  const model = selectEmbeddingModel();
  if (!model) {
    throw new Error(
      'No embedding model available — set AP_OPENAI_API_KEY to enable vector memory.',
    );
  }
  const result = await embed({ model, value: text });
  return result.embedding as number[];
}
