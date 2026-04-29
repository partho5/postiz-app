import { createGenerateContentCalendarTool } from './generate_content_calendar';
import type { OrchestratorContext } from '../types';

jest.mock('ai-v5', () => ({ generateObject: jest.fn() }));
jest.mock('../../memory', () => ({ getStructuredProfile: jest.fn() }));

import { generateObject } from 'ai-v5';
import { getStructuredProfile } from '../../memory';

function makeCtx(): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: {} as any,
    llm: { model: {} as any, complete: jest.fn() } as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

function makeEntries(weeks: number, perWeek: number) {
  const days = ['Monday', 'Wednesday', 'Friday'];
  return Array.from({ length: weeks * perWeek }, (_, i) => ({
    week: Math.floor(i / perWeek) + 1,
    dayOfWeek: days[i % days.length],
    platform: 'linkedin',
    topic: `Topic ${i + 1}`,
    format: 'short post',
  }));
}

describe('generate_content_calendar', () => {
  const tool = createGenerateContentCalendarTool();

  beforeEach(() => jest.clearAllMocks());

  it('has correct name and description', () => {
    expect(tool.name).toBe('generate_content_calendar');
    expect(tool.description).toContain('calendar');
    expect(tool.description.toLowerCase()).toContain('pure read');
  });

  it('returns a calendar with correct totals', async () => {
    const entries = makeEntries(2, 3);
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { weeks: 2, postsPerWeek: 3 });

    expect(result.data!.weeks).toBe(2);
    expect(result.data!.totalPosts).toBe(6);
    expect(result.data!.entries).toHaveLength(6);
  });

  it('defaults to 2 weeks and 3 posts per week', async () => {
    const entries = makeEntries(2, 3);
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, {});

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('6 posts');
    expect(callArgs.system).toContain('2 week');
    expect(result.data!.weeks).toBe(2);
  });

  it('groups observation output by week', async () => {
    const entries = makeEntries(2, 2);
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { weeks: 2, postsPerWeek: 2 });

    expect(result.observation).toContain('Week 1:');
    expect(result.observation).toContain('Week 2:');
  });

  it('includes niche from profile in system prompt', async () => {
    const entries = makeEntries(1, 2);
    (getStructuredProfile as jest.Mock).mockResolvedValue({
      businessProfile: { niche: 'B2B SaaS', goals: ['growth'], brandVoiceShort: 'bold' },
      growthRules: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    await tool.handler(ctx, { weeks: 1, postsPerWeek: 2 });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('B2B SaaS');
  });

  it('uses platform constraint when provided', async () => {
    const entries = makeEntries(1, 2);
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    await tool.handler(ctx, { weeks: 1, postsPerWeek: 2, platform: 'twitter' });

    const callArgs = (generateObject as jest.Mock).mock.calls[0][0];
    expect(callArgs.system).toContain('twitter');
  });

  it('caps entries to weeks × postsPerWeek', async () => {
    // LLM returns more entries than requested
    const entries = makeEntries(4, 4); // 16 entries
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { weeks: 2, postsPerWeek: 3 });

    expect(result.data!.entries.length).toBeLessThanOrEqual(6);
  });

  it('does not emit an SSE event', async () => {
    const entries = makeEntries(1, 1);
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    await tool.handler(ctx, { weeks: 1, postsPerWeek: 1 });

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('observation includes topic and platform info', async () => {
    const entries = makeEntries(1, 2);
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { entries } });

    const ctx = makeCtx();
    const result = await tool.handler(ctx, { weeks: 1, postsPerWeek: 2 });

    expect(result.observation).toContain('Topic 1');
    expect(result.observation).toContain('linkedin');
  });
});
