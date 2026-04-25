jest.mock('../../memory', () => ({
  queryVector: jest.fn(),
}));

import { createRecallMemoryTool } from './recall_memory';
import { queryVector } from '../../memory';
import type { OrchestratorContext } from '../types';

const mockQueryVector = queryVector as jest.MockedFunction<typeof queryVector>;

function makeCtx(): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-25T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

const sampleRows = [
  {
    id: 'mem-1',
    organizationId: 'org-1',
    kind: 'LEARNING' as any,
    content: 'Tuesday posts get more engagement.',
    sourceRef: null as Record<string, unknown> | null,
    freshnessTtlDays: null as number | null,
    createdAt: new Date('2026-04-20'),
    similarity: 0.92,
  },
  {
    id: 'mem-2',
    organizationId: 'org-1',
    kind: 'BRAND_RULE' as any,
    content: 'Never use jargon in captions.',
    sourceRef: null as Record<string, unknown> | null,
    freshnessTtlDays: null as number | null,
    createdAt: new Date('2026-04-21'),
    similarity: 0.85,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recall_memory tool', () => {
  test('calls queryVector with correct tenant, query, and topK', async () => {
    mockQueryVector.mockResolvedValue(sampleRows);
    const tool = createRecallMemoryTool();
    await tool.handler(makeCtx(), { query: 'best posting times', topK: 3 });

    expect(mockQueryVector).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'best posting times',
      3,
      undefined,
    );
  });

  test('passes kinds filter when provided', async () => {
    mockQueryVector.mockResolvedValue([sampleRows[1]]);
    const tool = createRecallMemoryTool();
    await tool.handler(makeCtx(), { query: 'brand rules', kinds: ['BRAND_RULE'] });

    expect(mockQueryVector).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'brand rules',
      5, // default topK
      ['BRAND_RULE'],
    );
  });

  test('observation lists results with kind and similarity', async () => {
    mockQueryVector.mockResolvedValue(sampleRows);
    const tool = createRecallMemoryTool();
    const result = await tool.handler(makeCtx(), { query: 'engagement' });

    expect(result.observation).toContain('LEARNING');
    expect(result.observation).toContain('Tuesday posts get more engagement');
    expect(result.observation).toContain('0.920');
    expect(result.data?.recalled).toBe(true);
    expect(result.data?.results).toHaveLength(2);
  });

  test('observation says no memories found when results are empty', async () => {
    mockQueryVector.mockResolvedValue([]);
    const tool = createRecallMemoryTool();
    const result = await tool.handler(makeCtx(), { query: 'something obscure' });

    expect(result.observation).toMatch(/no memories found/i);
    expect(result.data?.recalled).toBe(true);
    expect(result.data?.results).toHaveLength(0);
  });

  test('graceful error when queryVector throws (missing API key)', async () => {
    mockQueryVector.mockRejectedValue(new Error('AP_OPENAI_API_KEY not set'));
    const tool = createRecallMemoryTool();
    const result = await tool.handler(makeCtx(), { query: 'test' });

    expect(result.observation).toMatch(/AP_OPENAI_API_KEY/);
    expect(result.data?.recalled).toBe(false);
  });

  test('tool name is recall_memory', () => {
    expect(createRecallMemoryTool().name).toBe('recall_memory');
  });
});
