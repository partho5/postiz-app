/**
 * Chat-service routing tests — updated for slice 1.3.f
 *
 * After slice 1.3.f, the normal flow is simplified:
 *   - Any non-onboarding turn → orchestrator (no intent parsing)
 *
 * parseIntent is no longer imported by chat.service.ts. The module mock
 * is kept to avoid transitive import errors from other modules.
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
  // cadence-config.service.ts calls registerApplier at module load when
  // imported transitively through chat.service.ts — stub it to avoid
  // "not a function" in Jest's CommonJS module environment.
  registerApplier: jest.fn(),
}));

import { AutopilotChatService } from './chat.service';
import { createLlmProvider } from '../llm';
import { runOrchestrator } from '../agents/orchestrator';
import { getStructuredProfile } from '../memory';
import type { LlmProvider } from '../skills/types';

const mockCreateLlmProvider = createLlmProvider as jest.MockedFunction<
  typeof createLlmProvider
>;
const mockRunOrchestrator = runOrchestrator as jest.MockedFunction<
  typeof runOrchestrator
>;
const mockGetStructuredProfile = getStructuredProfile as jest.MockedFunction<
  typeof getStructuredProfile
>;

const fakeLlm: LlmProvider = {
  model: {} as any,
  complete: jest.fn(),
};

function makePrismaMock() {
  return {
    apChatMessage: {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    apTenantStrategyOptout: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    apPendingAction: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    apCadenceConfig: {
      findFirst: jest.fn().mockResolvedValue(null),
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
  test('all non-onboarding turns route through the orchestrator', async () => {
    const prisma = makePrismaMock();
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction, { pause: jest.fn(), resume: jest.fn() } as any, { sendEmail: jest.fn() } as any);

    await svc.handleChat(ORG, USER, { content: 'post about launch' }, () => {});

    expect(mockRunOrchestrator).toHaveBeenCalledTimes(1);
    expect(directAction.startFlow).not.toHaveBeenCalled();
    expect(mockRunOrchestrator.mock.calls[0][1].message).toBe('post about launch');
  });

  test('orchestrator receives directAction dependency', async () => {
    const prisma = makePrismaMock();
    const directAction = {
      startFlow: jest.fn(),
      cancelAction: jest.fn(),
      continuePending: jest.fn(),
    } as any;
    const svc = new AutopilotChatService(prisma, directAction, { pause: jest.fn(), resume: jest.fn() } as any, { sendEmail: jest.fn() } as any);

    await svc.handleChat(ORG, USER, { content: 'hello' }, () => {});

    const call = mockRunOrchestrator.mock.calls[0];
    expect(call[0].directAction).toBe(directAction);
  });

  test('small-talk and ambiguous messages also route through the orchestrator', async () => {
    const prisma = makePrismaMock();
    const svc = new AutopilotChatService(
      prisma,
      { startFlow: jest.fn(), cancelAction: jest.fn(), continuePending: jest.fn() } as any,
      { pause: jest.fn(), resume: jest.fn() } as any,
      { sendEmail: jest.fn() } as any,
    );

    await svc.handleChat(ORG, USER, { content: 'thanks' }, () => {});

    // After 1.3.f all turns hit the orchestrator — no streamText fallback.
    expect(mockRunOrchestrator).toHaveBeenCalledTimes(1);
  });

  test('pending-action turns route through orchestrator (regression: "after 5 minutes" loop)', async () => {
    const prisma = makePrismaMock();
    const svc = new AutopilotChatService(
      prisma,
      { startFlow: jest.fn(), cancelAction: jest.fn(), continuePending: jest.fn() } as any,
      { pause: jest.fn(), resume: jest.fn() } as any,
      { sendEmail: jest.fn() } as any,
    );

    await svc.handleChat(ORG, USER, { content: 'after 5 minutes' }, () => {});

    expect(mockRunOrchestrator).toHaveBeenCalledTimes(1);
    expect(mockRunOrchestrator.mock.calls[0][1].message).toBe('after 5 minutes');
  });

  test('orchestrator failure surfaces an error event and stops', async () => {
    const prisma = makePrismaMock();
    const svc = new AutopilotChatService(
      prisma,
      { startFlow: jest.fn(), cancelAction: jest.fn(), continuePending: jest.fn() } as any,
      { pause: jest.fn(), resume: jest.fn() } as any,
      { sendEmail: jest.fn() } as any,
    );
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
    const svc = new AutopilotChatService(
      prisma,
      { startFlow: jest.fn(), cancelAction: jest.fn(), continuePending: jest.fn() } as any,
      { pause: jest.fn(), resume: jest.fn() } as any,
      { sendEmail: jest.fn() } as any,
    );
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
