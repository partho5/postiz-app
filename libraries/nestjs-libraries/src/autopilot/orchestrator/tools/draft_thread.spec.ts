import { createDraftThreadTool } from './draft_thread';
import type { OrchestratorContext } from '../types';

jest.mock('ai-v5', () => ({ generateObject: jest.fn() }));
jest.mock('../../memory', () => ({ getStructuredProfile: jest.fn() }));
jest.mock('../../stack', () => ({ push: jest.fn() }));

import { generateObject } from 'ai-v5';
import { getStructuredProfile } from '../../memory';
import { push } from '../../stack';

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

const mockParts = [
  { text: '1/ The future of AI is here. Thread:' },
  { text: '2/ First, let\'s talk about the data.' },
  { text: '3/ The implications are enormous.' },
  { text: '4/ Here is what you can do today.' },
  { text: '5/ To summarize: act now. Follow for more!' },
];

describe('draft_thread', () => {
  const tool = createDraftThreadTool();

  beforeEach(() => {
    jest.clearAllMocks();
    (getStructuredProfile as jest.Mock).mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({ object: { parts: mockParts } });
    let callCount = 0;
    (push as jest.Mock).mockImplementation(() => Promise.resolve({ id: `cand-${++callCount}` }));
  });

  it('has correct name and description', () => {
    expect(tool.name).toBe('draft_thread');
    expect(tool.description).toContain('thread');
    expect(tool.description).toContain('thread ID');
  });

  it('pushes one candidate per thread part', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { topic: 'AI future', threadLength: 5 });

    expect(push).toHaveBeenCalledTimes(5);
    expect(result.data!.candidateIds).toHaveLength(5);
    expect(result.data!.partCount).toBe(5);
  });

  it('all parts share the same threadId in metadata', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'thread topic' });

    const calls = (push as jest.Mock).mock.calls;
    const threadIds = calls.map((c: any) => c[4].metadata.threadId);
    const uniqueIds = new Set(threadIds);
    expect(uniqueIds.size).toBe(1);
  });

  it('metadata includes threadPart index', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'AI' });

    const calls = (push as jest.Mock).mock.calls;
    expect(calls[0][4].metadata.threadPart).toBe(1);
    expect(calls[4][4].metadata.threadPart).toBe(5);
  });

  it('emits action_result with part count', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'AI' });

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
    const emitArg = (ctx.emit as jest.Mock).mock.calls[0][0];
    expect(emitArg.message).toContain('5');
  });

  it('defaults platform to twitter and threadLength to 5', async () => {
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { topic: 'default test' });

    expect(result.data!.platform).toBe('twitter');
    expect(result.data!.partCount).toBe(5);
  });

  it('clamps parts to requested threadLength', async () => {
    // LLM returns 5 parts but user requested 3
    (generateObject as jest.Mock).mockResolvedValue({ object: { parts: mockParts } });
    const ctx = makeCtx();
    const result = await tool.handler(ctx, { topic: 'short thread', threadLength: 3 });

    expect(push).toHaveBeenCalledTimes(3);
    expect(result.data!.partCount).toBe(3);
  });

  it('scopes push to correct org', async () => {
    const ctx = makeCtx();
    await tool.handler(ctx, { topic: 'test', platform: 'linkedin' });

    const calls = (push as jest.Mock).mock.calls;
    calls.forEach((c: any) => {
      expect(c[1]).toBe('org-1');
      expect(c[2]).toBe('linkedin');
    });
  });
});
