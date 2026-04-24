/**
 * Chat-service routing tests — slice 1.3.c
 *
 * Focused on the routing decision after slice 1.3.c rewired the
 * "normal flow" branch:
 *   - intent=direct_action → orchestrator
 *   - hasPending=true (any intent) → orchestrator
 *   - intent=config_change_request (no pending) → proposal pipeline
 *   - else (no pending) → existing streamText reply
 *
 * Heavy collaborators are mocked at the module boundary so this spec
 * stays fast and deterministic.
 */

jest.mock('../llm', () => ({
  createLlmProvider: jest.fn(),
}));
jest.mock('../agents/intent_parser', () => ({
  parseIntent: jest.fn(),
}));
jest.mock('../agents/orchestrator', () => ({
  runOrchestrator: jest.fn(),
}));
jest.mock('../memory', () => ({
  getStructuredProfile: jest.fn(),
}));
jest.mock('./proposals', () => ({
  createProposal: jest.fn().mockResolvedValue('prop-1'),
  confirm: jest.fn(),
  cancel: jest.fn(),
}));
jest.mock('ai-v5', () => ({
  ...jest.requireActual('ai-v5'),
  streamText: jest.fn(() => ({
    textStream: (async function* () {
      yield 'reply text';
    })(),
  })),
}));

import { AutopilotChatService } from './chat.service';
import { createLlmProvider } from '../llm';
import { parseIntent } from '../agents/intent_parser';
import { runOrchestrator } from '../agents/orchestrator';
import { getStructuredProfile } from '../memory';
import { createProposal } from './proposals';
import type { LlmProvider } from '../skills/types';

const mockCreateLlmProvider = createLlmProvider as jest.MockedFunction<
  typeof createLlmProvider
>;
const mockParseIntent = parseIntent as jest.MockedFunction<typeof parseIntent>;
const mockRunOrchestrator = runOrchestrator as jest.MockedFunction<
  typeof runOrchestrator
>;
const mockGetStructuredProfile = getStructuredProfile as jest.MockedFunction<
  typeof getStructuredProfile
>;
const mockCreateProposal = createProposal as jest.MockedFunction<
  typeof createProposal
>;

const fakeLlm: LlmProvider = {
  model: {} as any,
  complete: jest.fn(),
};

function makePrismaMock(opts: {
  pending?: { id: string; waitingFor: string; collectedData: unknown; expiresAt: Date } | null;
} = {}) {
  return {
    apChatMessage: {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    apTenantStrategyOptout: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    apPendingAction: {
      findUnique: jest.fn().mockResolvedValue(opts.pending ?? null),
    },
  } as any;
}

const ORG = { id: 'org-1' } as any;
const USER = { id: 'user-1' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateLlmProvider.mockReturnValue(fakeLlm);
  mockGetStructuredProfile.mockResolvedValue({
    businessProfile: {
      id: 'bp-1',
      niche: 'SaaS',
      goals: [],
      brandVoiceShort: '',
      brandVoiceExtended: '',
      antiPatterns: [],
      regulatoryFlags: [],
      updatedAt: new Date(),
      updatedBy: 'user',
    },
    growthRules: [],
  } as any);
  mockRunOrchestrator.mockResolvedValue({
    text: '',
    toolCallCount: 0,
    toolsUsed: [],
  });
});

describe('AutopilotChatService — routing', () => {
  test('routes direct_action through the orchestrator (not legacy startFlow)', async () => {
    const prisma = makePrismaMock();
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction);
    mockParseIntent.mockResolvedValue({
      intent: 'direct_action',
      directAction: { topic: 'launch' },
    });

    const events: any[] = [];
    await svc.handleChat(ORG, USER, { content: 'post about launch' }, (e) =>
      events.push(e),
    );

    expect(mockRunOrchestrator).toHaveBeenCalledTimes(1);
    expect(directAction.startFlow).not.toHaveBeenCalled();
    expect(directAction.continuePending).not.toHaveBeenCalled();

    const call = mockRunOrchestrator.mock.calls[0];
    expect(call[0].directAction).toBe(directAction);
    expect(call[1].message).toBe('post about launch');
  });

  test('routes any pending-action turn through orchestrator regardless of intent', async () => {
    const prisma = makePrismaMock({
      pending: {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: { topic: 'launch' },
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction);

    // Even when intent_parser misfires and returns "unclear", a live
    // pending action MUST still send the message into the orchestrator
    // (otherwise the loop bug returns).
    mockParseIntent.mockResolvedValue({ intent: 'unclear' });

    await svc.handleChat(ORG, USER, { content: 'after 5 minutes' }, () => {});

    expect(mockRunOrchestrator).toHaveBeenCalledTimes(1);
    expect(mockRunOrchestrator.mock.calls[0][1].message).toBe('after 5 minutes');
    expect(directAction.continuePending).not.toHaveBeenCalled();
  });

  test('config_change_request without pending action goes to the proposal path', async () => {
    const prisma = makePrismaMock();
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction);
    mockParseIntent.mockResolvedValue({
      intent: 'config_change_request',
      draft: {
        targetEntity: 'business_profile',
        targetId: null,
        changes: { niche: 'SaaS' },
        rationale: "I'll set niche to SaaS.",
      },
    });

    const events: any[] = [];
    await svc.handleChat(ORG, USER, { content: 'set niche to SaaS' }, (e) =>
      events.push(e),
    );

    expect(mockRunOrchestrator).not.toHaveBeenCalled();
    expect(mockCreateProposal).toHaveBeenCalled();
    const proposalEvent = events.find((e) => e.type === 'proposal');
    expect(proposalEvent).toBeDefined();
    expect(proposalEvent.targetEntity).toBe('business_profile');
  });

  test('expired pending action does NOT force orchestrator route', async () => {
    const prisma = makePrismaMock({
      pending: {
        id: 'pa-1',
        waitingFor: 'timing',
        collectedData: {},
        expiresAt: new Date(Date.now() - 60_000), // expired
      },
    });
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction);
    mockParseIntent.mockResolvedValue({ intent: 'small_talk' });

    await svc.handleChat(ORG, USER, { content: 'thanks' }, () => {});

    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  test('orchestrator failure surfaces an error event and stops', async () => {
    const prisma = makePrismaMock();
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction);
    mockParseIntent.mockResolvedValue({
      intent: 'direct_action',
      directAction: {},
    });
    mockRunOrchestrator.mockRejectedValue(new Error('llm down'));

    const events: any[] = [];
    await svc.handleChat(ORG, USER, { content: 'post' }, (e) => events.push(e));

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toMatch(/Orchestrator failed.*llm down/);
    // Should NOT emit a done event after the error.
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
  });

  test('orchestrator returning empty text → done event with no message persisted', async () => {
    const prisma = makePrismaMock();
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction);
    mockParseIntent.mockResolvedValue({
      intent: 'direct_action',
      directAction: { topic: 'x' },
    });
    mockRunOrchestrator.mockResolvedValue({
      text: '', // tool already emitted draft_preview
      toolCallCount: 1,
      toolsUsed: ['schedule_post'],
    });

    const events: any[] = [];
    await svc.handleChat(ORG, USER, { content: 'post about x' }, (e) =>
      events.push(e),
    );

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.assistantMessageId).toBe('');
    // No second create call (only the user message was persisted).
    expect(prisma.apChatMessage.create).toHaveBeenCalledTimes(1);
  });
});
