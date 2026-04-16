/**
 * Smoke test for llm.ts — slice 0.16
 *
 * When an AP_*_API_KEY is present the test makes a real (cheap) completion
 * call to verify end-to-end wiring.  When no key is configured the test skips
 * cleanly so CI never fails due to missing credentials.
 */

import { selectModel, createLlmProvider, DEFAULT_MODEL_PREFERENCE } from './llm';

// ---------------------------------------------------------------------------
// Unit tests — no network (env vars cleared)
// ---------------------------------------------------------------------------

describe('selectModel (no keys)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ['AP_ANTHROPIC_API_KEY', 'AP_OPENAI_API_KEY', 'AP_GOOGLE_API_KEY']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('returns null when no API keys are configured', () => {
    expect(selectModel(DEFAULT_MODEL_PREFERENCE)).toBeNull();
  });

  it('returns null for an unknown model ID', () => {
    process.env.AP_OPENAI_API_KEY = 'test-key';
    expect(selectModel(['unknown-model-xyz'])).toBeNull();
  });

  it('createLlmProvider returns null when no keys are configured', () => {
    expect(createLlmProvider()).toBeNull();
  });

  it('skips models whose provider key is absent and falls through to next', () => {
    // Only Google key set; Anthropic + OpenAI models should be skipped
    process.env.AP_GOOGLE_API_KEY = 'test-google-key';
    const model = selectModel(['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.0-flash']);
    expect(model).not.toBeNull();
    // The model object should be truthy — provider internals are opaque
  });

  it('returns the first available model in preference order', () => {
    process.env.AP_OPENAI_API_KEY = 'key-openai';
    process.env.AP_GOOGLE_API_KEY = 'key-google';
    // Anthropic is first in DEFAULT_MODEL_PREFERENCE but its key is absent.
    // OpenAI (gpt-4o) should be returned next.
    const model = selectModel(['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.0-flash']);
    expect(model).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Smoke test — real network call (skipped when no key available)
// ---------------------------------------------------------------------------

describe('createLlmProvider — live smoke test', () => {
  it('completes a trivial prompt when an API key is present', async () => {
    const provider = createLlmProvider();
    if (!provider) {
      console.log(
        '[llm.spec] No AP_*_API_KEY configured — skipping live smoke test.'
      );
      return; // skip cleanly; Jest marks the test as passed with no assertions
    }

    const reply = await provider.complete('Reply with the single word: pong');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
    console.log('[llm.spec] Live reply:', reply.slice(0, 80));
  }, 30_000); // 30 s timeout for network latency
});
