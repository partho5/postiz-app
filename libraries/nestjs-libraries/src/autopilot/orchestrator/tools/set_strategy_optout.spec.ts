jest.mock('../../chat/proposals', () => ({
  createProposal: jest.fn().mockResolvedValue('prop-99'),
  registerApplier: jest.fn(),
}));

import { createSetStrategyOptoutTool } from './set_strategy_optout';
import { createProposal } from '../../chat/proposals';
import type { OrchestratorContext } from '../types';

const mockCreateProposal = createProposal as jest.MockedFunction<typeof createProposal>;

function makeCtx(emit = jest.fn()): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit,
    now: new Date('2026-04-25T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateProposal.mockResolvedValue('prop-99');
});

describe('set_strategy_optout tool', () => {
  test('creates proposal with targetEntity tenant_strategy_optout when opting out', async () => {
    const tool = createSetStrategyOptoutTool();
    await tool.handler(makeCtx(), { optedOut: true });

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.objectContaining({
        targetEntity: 'tenant_strategy_optout',
        changes: expect.objectContaining({ optedOut: true }),
      }),
    );
  });

  test('creates proposal with optedOut: false when opting back in', async () => {
    const tool = createSetStrategyOptoutTool();
    await tool.handler(makeCtx(), { optedOut: false });

    const call = mockCreateProposal.mock.calls[0][2];
    expect(call.changes).toEqual({ optedOut: false });
  });

  test('includes reason in changes when provided', async () => {
    const tool = createSetStrategyOptoutTool();
    await tool.handler(makeCtx(), { optedOut: true, reason: 'privacy concerns' });

    const call = mockCreateProposal.mock.calls[0][2];
    expect(call.changes).toEqual({ optedOut: true, reason: 'privacy concerns' });
  });

  test('emits proposal SSE event with tenant_strategy_optout entity', async () => {
    const emit = jest.fn();
    const tool = createSetStrategyOptoutTool();
    await tool.handler(makeCtx(emit), { optedOut: true });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'proposal',
        proposalId: 'prop-99',
        targetEntity: 'tenant_strategy_optout',
      }),
    );
  });

  test('returns emitted: true', async () => {
    const tool = createSetStrategyOptoutTool();
    const result = await tool.handler(makeCtx(), { optedOut: false });
    expect(result.emitted).toBe(true);
  });

  test('observation mentions opt-out direction', async () => {
    const tool = createSetStrategyOptoutTool();

    const outResult = await tool.handler(makeCtx(), { optedOut: true });
    expect(outResult.observation).toMatch(/opt-out/i);

    const inResult = await tool.handler(makeCtx(), { optedOut: false });
    expect(inResult.observation).toMatch(/opt-in/i);
  });
});
