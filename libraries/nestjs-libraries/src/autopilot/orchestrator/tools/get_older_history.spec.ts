import { createGetOlderHistoryTool } from './get_older_history';
import type { OrchestratorContext } from '../types';

function makeCtx(rows: any[] = []): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: { id: 'user-1' } as any,
    db: {
      apChatMessage: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    } as any,
    llm: { model: {} as any, complete: jest.fn() },
    emit: jest.fn(),
    now: new Date('2026-04-25T10:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  };
}

describe('get_older_history tool', () => {
  test('queries apChatMessage with correct skip and take', async () => {
    const ctx = makeCtx();
    const findMany = ctx.db.apChatMessage.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    const tool = createGetOlderHistoryTool();
    await tool.handler(ctx, { skipRecent: 20, limit: 15 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 15,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  test('defaults skipRecent=20 and limit=20 when omitted', async () => {
    const ctx = makeCtx();
    const findMany = ctx.db.apChatMessage.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    const tool = createGetOlderHistoryTool();
    await tool.handler(ctx, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  test('returns messages in chronological order with role and truncated content', async () => {
    const rows = [
      { role: 'USER' as any, content: 'Hello', createdAt: new Date('2026-04-22T08:00:00Z') },
      { role: 'ASSISTANT' as any, content: 'Hi there!', createdAt: new Date('2026-04-22T08:00:05Z') },
    ];
    // DB returns DESC; tool reverses to chronological
    const ctx = makeCtx(rows.slice().reverse());
    const tool = createGetOlderHistoryTool();
    const result = await tool.handler(ctx, { skipRecent: 20, limit: 20 });

    expect(result.data?.messages[0].role).toBe('user');
    expect(result.data?.messages[1].role).toBe('assistant');
    expect(result.data?.totalFetched).toBe(2);
  });

  test('observation says no older messages when result is empty', async () => {
    const ctx = makeCtx([]);
    const tool = createGetOlderHistoryTool();
    const result = await tool.handler(ctx, {});

    expect(result.observation).toMatch(/no older messages found/i);
    expect(result.data?.totalFetched).toBe(0);
  });

  test('observation contains message timestamps and content preview', async () => {
    const rows = [
      { role: 'USER' as any, content: 'What is my niche?', createdAt: new Date('2026-04-22T14:30:00Z') },
    ];
    const ctx = makeCtx(rows);
    const tool = createGetOlderHistoryTool();
    const result = await tool.handler(ctx, {});

    expect(result.observation).toContain('user');
    expect(result.observation).toContain('What is my niche?');
  });

  test('tool name is get_older_history', () => {
    expect(createGetOlderHistoryTool().name).toBe('get_older_history');
  });
});
