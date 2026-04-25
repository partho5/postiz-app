jest.mock('../../chat/proposals', () => ({
  createProposal: jest.fn().mockResolvedValue('prop-42'),
  registerApplier: jest.fn(),
}));

import { createUpdateBusinessProfileTool } from './update_business_profile';
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
  mockCreateProposal.mockResolvedValue('prop-42');
});

describe('update_business_profile tool', () => {
  test('calls createProposal with business_profile entity and supplied changes', async () => {
    const tool = createUpdateBusinessProfileTool();
    await tool.handler(makeCtx(), {
      changes: { niche: 'Fintech', goals: ['grow audience'] },
      rationale: 'User said they are in fintech.',
    });

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.objectContaining({
        targetEntity: 'business_profile',
        changes: { niche: 'Fintech', goals: ['grow audience'] },
        rationale: 'User said they are in fintech.',
      }),
    );
  });

  test('emits proposal SSE event with proposal id, rationale, targetEntity, changes', async () => {
    const emit = jest.fn();
    const tool = createUpdateBusinessProfileTool();
    await tool.handler(makeCtx(emit), {
      changes: { niche: 'SaaS' },
      rationale: "Updating niche to SaaS.",
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'proposal',
        proposalId: 'prop-42',
        targetEntity: 'business_profile',
        changes: { niche: 'SaaS' },
      }),
    );
  });

  test('returns emitted: true to suppress orchestrator text echo', async () => {
    const tool = createUpdateBusinessProfileTool();
    const result = await tool.handler(makeCtx(), {
      changes: { brandVoiceShort: 'Bold and direct' },
      rationale: 'User wants bold tone.',
    });

    expect(result.emitted).toBe(true);
    expect(result.data?.proposalId).toBe('prop-42');
  });

  test('observation mentions proposal id and waiting-for-confirm', async () => {
    const tool = createUpdateBusinessProfileTool();
    const result = await tool.handler(makeCtx(), {
      changes: { niche: 'EdTech' },
      rationale: 'Switching to EdTech.',
    });

    expect(result.observation).toMatch(/prop-42/);
    expect(result.observation).toMatch(/confirm/i);
  });

  test('tool name is update_business_profile', () => {
    const tool = createUpdateBusinessProfileTool();
    expect(tool.name).toBe('update_business_profile');
  });
});
