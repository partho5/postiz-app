/**
 * Unit tests for the Memorist agent — slice 1.7
 *
 * generateObject and writeVector are mocked so tests are deterministic
 * and require no API key or database connection.
 */

jest.mock('ai-v5');
jest.mock('../memory', () => ({
  // Keep the real enum values; only stub the write side-effect.
  ...jest.requireActual('../memory'),
  writeVector: jest.fn().mockResolvedValue('mock-vector-id'),
}));

import { generateObject } from 'ai-v5';
import type { LanguageModel } from 'ai-v5';
import * as memoryModule from '../memory';
import { runMemorist, memoristAgent } from './memorist';
import type { AgentContext } from './types';
import type { LlmProvider } from '../skills/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;
const mockWriteVector = memoryModule.writeVector as jest.MockedFunction<typeof memoryModule.writeVector>;

const fakeLlm: LlmProvider = {
  model: {} as LanguageModel,
  complete: jest.fn(),
};

function makeCtx(): AgentContext {
  return {
    tenant: { id: 'tenant-42' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: fakeLlm,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('runMemorist — edge cases', () => {
  it('returns empty decisions and stored=0 for an empty turn batch', async () => {
    const result = await runMemorist(makeCtx(), { turns: [] });

    expect(result.decisions).toHaveLength(0);
    expect(result.stored).toBe(0);
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockWriteVector).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Decision routing
// ---------------------------------------------------------------------------

describe('runMemorist — decision routing', () => {
  it('skips a turn when action is skip (no write)', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decisions: [{ index: 0, action: 'skip' }],
      },
    } as any);

    const result = await runMemorist(makeCtx(), {
      turns: [{ role: 'user', content: 'okay thanks' }],
    });

    expect(result.decisions[0].action).toBe('skip');
    expect(result.stored).toBe(0);
    expect(mockWriteVector).not.toHaveBeenCalled();
  });

  it('writes to memory for a store decision', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decisions: [
          { index: 0, action: 'store', kind: 'BRAND_RULE', content: 'Use a warm, conversational tone.' },
        ],
      },
    } as any);

    const result = await runMemorist(makeCtx(), {
      turns: [{ role: 'user', content: 'Please keep the tone warm and conversational.' }],
    });

    expect(result.stored).toBe(1);
    expect(mockWriteVector).toHaveBeenCalledTimes(1);
    expect(mockWriteVector).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      expect.objectContaining({ kind: 'BRAND_RULE', content: 'Use a warm, conversational tone.' }),
    );
  });

  it('writes to memory for an update decision (treated as new row)', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decisions: [
          { index: 0, action: 'update', kind: 'MILESTONE', content: 'User now targets 10k followers by Q3.' },
        ],
      },
    } as any);

    const result = await runMemorist(makeCtx(), {
      turns: [{ role: 'user', content: 'Actually, let us aim for 10k followers by Q3.' }],
    });

    expect(result.stored).toBe(1);
    expect(mockWriteVector).toHaveBeenCalledTimes(1);
  });

  it('handles a mixed batch: only store/update entries are written', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decisions: [
          { index: 0, action: 'skip' },
          { index: 1, action: 'store', kind: 'ANECDOTE', content: 'User launched their first product in 2019.' },
          { index: 2, action: 'skip' },
          { index: 3, action: 'update', kind: 'BRAND_RULE', content: 'Avoid jargon; write for a general audience.' },
        ],
      },
    } as any);

    const result = await runMemorist(makeCtx(), {
      turns: [
        { role: 'assistant', content: 'Got it.' },
        { role: 'user', content: 'We started in 2019 with our first product.' },
        { role: 'assistant', content: 'Interesting!' },
        { role: 'user', content: 'Please avoid jargon in all posts.' },
      ],
    });

    expect(result.decisions).toHaveLength(4);
    expect(result.stored).toBe(2);
    expect(mockWriteVector).toHaveBeenCalledTimes(2);
  });

  it('does not write when store decision is missing kind or content', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decisions: [
          // LLM returned a store without kind/content — should be silently skipped.
          { index: 0, action: 'store' },
        ],
      },
    } as any);

    const result = await runMemorist(makeCtx(), {
      turns: [{ role: 'user', content: 'something ambiguous' }],
    });

    expect(result.stored).toBe(0);
    expect(mockWriteVector).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sourceRef forwarding
// ---------------------------------------------------------------------------

describe('runMemorist — sourceRef', () => {
  it('forwards turn metadata to the sourceRef field', async () => {
    const metadata = { messageId: 'msg-99', source: 'web' };

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decisions: [
          { index: 0, action: 'store', kind: 'LEARNING', content: 'Short-form video outperforms static images.' },
        ],
      },
    } as any);

    await runMemorist(makeCtx(), {
      turns: [{ role: 'user', content: 'Videos work better than images.', metadata }],
    });

    expect(mockWriteVector).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-42',
      expect.objectContaining({ sourceRef: metadata }),
    );
  });
});

// ---------------------------------------------------------------------------
// LLM call contract
// ---------------------------------------------------------------------------

describe('runMemorist — LLM call', () => {
  it('passes the system prompt and numbered turns text to generateObject', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { decisions: [{ index: 0, action: 'skip' }] },
    } as any);

    await runMemorist(makeCtx(), {
      turns: [{ role: 'user', content: 'Hello' }],
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('memory-curation'),
        prompt: expect.stringContaining('[0] USER: Hello'),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AgentDefinition contract
// ---------------------------------------------------------------------------

describe('memoristAgent', () => {
  it('has the expected id', () => {
    expect(memoristAgent.id).toBe('memorist');
  });

  it('declares no allowed skills (memory writes are direct, not via skill pipeline)', () => {
    expect(memoristAgent.allowedSkills).toHaveLength(0);
  });

  it('run() delegates to runMemorist', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { decisions: [{ index: 0, action: 'skip' }] },
    } as any);

    const ctx = makeCtx();
    const result = await memoristAgent.run(ctx, {
      turns: [{ role: 'assistant', content: 'Sure!' }],
    });

    expect(result.decisions[0].action).toBe('skip');
    expect(result.stored).toBe(0);
  });
});
