jest.mock('../../memory', () => ({
  writeVector: jest.fn().mockResolvedValue('vec-123'),
}));

import { createSaveMemoryTool } from './save_memory';
import { writeVector } from '../../memory';
import type { OrchestratorContext } from '../types';

const mockWriteVector = writeVector as jest.MockedFunction<typeof writeVector>;

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

beforeEach(() => {
  jest.clearAllMocks();
  mockWriteVector.mockResolvedValue('vec-123');
});

describe('save_memory tool', () => {
  test('calls writeVector with the correct tenant, content, and kind', async () => {
    const tool = createSaveMemoryTool();
    await tool.handler(makeCtx(), {
      content: 'Our audience is primarily developers aged 25-40.',
      kind: 'BRAND_RULE',
    });

    expect(mockWriteVector).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.objectContaining({
        kind: 'BRAND_RULE',
        content: 'Our audience is primarily developers aged 25-40.',
      }),
    );
  });

  test('defaults kind to LEARNING when omitted', async () => {
    const tool = createSaveMemoryTool();
    await tool.handler(makeCtx(), { content: 'Tuesday posts get more engagement.' });

    const call = mockWriteVector.mock.calls[0][2];
    expect(call.kind).toBe('LEARNING');
  });

  test('passes freshnessTtlDays when provided', async () => {
    const tool = createSaveMemoryTool();
    await tool.handler(makeCtx(), {
      content: 'Temporary campaign note.',
      freshnessTtlDays: 14,
    });

    const call = mockWriteVector.mock.calls[0][2];
    expect(call.freshnessTtlDays).toBe(14);
  });

  test('observation includes memory id and kind on success', async () => {
    const tool = createSaveMemoryTool();
    const result = await tool.handler(makeCtx(), {
      content: 'Company reached 1000 users.',
      kind: 'MILESTONE',
    });

    expect(result.observation).toContain('vec-123');
    expect(result.observation).toMatch(/MILESTONE/);
    expect(result.data?.saved).toBe(true);
  });

  test('graceful error when writeVector throws (missing API key)', async () => {
    mockWriteVector.mockRejectedValue(new Error('AP_OPENAI_API_KEY not set'));
    const tool = createSaveMemoryTool();
    const result = await tool.handler(makeCtx(), { content: 'some fact' });

    expect(result.observation).toMatch(/AP_OPENAI_API_KEY/);
    expect(result.data?.saved).toBe(false);
    expect(result.emitted).toBeFalsy();
  });

  test('tool name is save_memory', () => {
    expect(createSaveMemoryTool().name).toBe('save_memory');
  });
});
