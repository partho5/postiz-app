jest.mock('../../memory', () => ({
  getStructuredProfile: jest.fn(),
}));

import { createGetProfileTool } from './get_profile';
import { getStructuredProfile } from '../../memory';
import type { OrchestratorContext } from '../types';

const mockGetStructuredProfile = getStructuredProfile as jest.MockedFunction<
  typeof getStructuredProfile
>;

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

const fullProfile = {
  businessProfile: {
    id: 'bp-1',
    niche: 'SaaS',
    goals: ['grow audience', 'increase engagement'] as unknown[],
    brandVoiceShort: 'Bold, direct',
    brandVoiceExtended: 'No fluff, data-driven narratives.',
    antiPatterns: ['clichés'] as unknown[],
    regulatoryFlags: [] as unknown[],
    updatedAt: new Date('2026-04-20'),
    updatedBy: 'AI',
  },
  growthRules: [
    {
      id: 'gr-1',
      ruleKey: 'post_frequency',
      ruleValue: '2x daily',
      active: true,
      source: 'AI',
      updatedAt: new Date('2026-04-20'),
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('get_profile tool', () => {
  test('returns "no profile" observation when business profile is absent', async () => {
    mockGetStructuredProfile.mockResolvedValue({
      businessProfile: null,
      growthRules: [],
    });

    const tool = createGetProfileTool();
    const result = await tool.handler(makeCtx(), {});

    expect(result.observation).toMatch(/no business profile/i);
    expect(result.data?.hasProfile).toBe(false);
  });

  test('formats all profile fields in the observation', async () => {
    mockGetStructuredProfile.mockResolvedValue(fullProfile as any);

    const tool = createGetProfileTool();
    const result = await tool.handler(makeCtx(), {});

    expect(result.observation).toContain('SaaS');
    expect(result.observation).toContain('Bold, direct');
    expect(result.data?.hasProfile).toBe(true);
  });

  test('includes growth rules count in the observation', async () => {
    mockGetStructuredProfile.mockResolvedValue(fullProfile as any);

    const tool = createGetProfileTool();
    const result = await tool.handler(makeCtx(), {});

    expect(result.observation).toContain('post_frequency');
  });

  test('renders growth rules as "(none)" when array is empty', async () => {
    mockGetStructuredProfile.mockResolvedValue({
      businessProfile: { ...fullProfile.businessProfile },
      growthRules: [],
    } as any);

    const tool = createGetProfileTool();
    const result = await tool.handler(makeCtx(), {});

    expect(result.observation).toMatch(/none/i);
  });

  test('tool name is get_profile', () => {
    expect(createGetProfileTool().name).toBe('get_profile');
  });
});
