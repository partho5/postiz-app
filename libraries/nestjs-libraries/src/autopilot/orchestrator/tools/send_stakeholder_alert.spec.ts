import { createSendStakeholderAlertTool } from './send_stakeholder_alert';
import type { OrchestratorContext } from '../types';

function makeCtx(dbOverride?: any): OrchestratorContext {
  return {
    org: { id: 'org-1' } as any,
    user: {} as any,
    db: dbOverride ?? ({} as any),
    llm: { model: {} as any, complete: jest.fn() } as any,
    emit: jest.fn(),
    now: new Date('2026-05-01T12:00:00Z'),
    timezone: 'UTC',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  };
}

function makeEmailService(sendFn = jest.fn().mockResolvedValue(undefined)) {
  return { sendEmail: sendFn } as any;
}

function makeDb(members: { email: string; disabled?: boolean }[]) {
  return {
    userOrganization: {
      findMany: jest.fn().mockResolvedValue(
        members.map((m) => ({ user: { email: m.email }, disabled: m.disabled ?? false })),
      ),
    },
  } as any;
}

describe('send_stakeholder_alert', () => {
  it('has correct name and description', () => {
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService() });
    expect(tool.name).toBe('send_stakeholder_alert');
    expect(tool.description).toContain('NOT for posting to social media');
    expect(tool.description).toContain('stakeholder');
  });

  it('sends email to each active org member', async () => {
    const sendFn = jest.fn().mockResolvedValue(undefined);
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService(sendFn) });
    const db = makeDb([{ email: 'alice@example.com' }, { email: 'bob@example.com' }]);
    const ctx = makeCtx(db);

    const result = await tool.handler(ctx, { subject: 'Crisis alert', message: 'Server is down.' });

    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(sendFn).toHaveBeenCalledWith('alice@example.com', 'Crisis alert', expect.any(String));
    expect(sendFn).toHaveBeenCalledWith('bob@example.com', 'Crisis alert', expect.any(String));
    expect(result.data!.recipientCount).toBe(2);
    expect(result.data!.sent).toBe(true);
    expect(result.emitted).toBe(true);
  });

  it('emits action_result ok=true when all sends succeed', async () => {
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService() });
    const db = makeDb([{ email: 'admin@co.com' }]);
    const ctx = makeCtx(db);

    await tool.handler(ctx, { subject: 'Alert', message: 'Issue found.' });

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: true }),
    );
  });

  it('emits action_result ok=false when no members found', async () => {
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService() });
    const db = makeDb([]);
    const ctx = makeCtx(db);

    const result = await tool.handler(ctx, { subject: 'Alert', message: 'Crisis.' });

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_result', ok: false }),
    );
    expect(result.data!.recipientCount).toBe(0);
    expect(result.data!.sent).toBe(false);
  });

  it('continues sending to remaining recipients when one fails', async () => {
    const sendFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('delivery failed'))
      .mockResolvedValue(undefined);
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService(sendFn) });
    const db = makeDb([{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }]);
    const ctx = makeCtx(db);

    const result = await tool.handler(ctx, { subject: 'Urgent', message: 'Fix needed.' });

    expect(sendFn).toHaveBeenCalledTimes(3);
    expect(result.data!.recipientCount).toBe(2);
    expect(result.data!.sent).toBe(true);
  });

  it('filters out entries with invalid email addresses', async () => {
    const sendFn = jest.fn().mockResolvedValue(undefined);
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService(sendFn) });
    const db = makeDb([
      { email: 'valid@example.com' },
      { email: 'not-an-email' },
      { email: '' },
    ]);
    const ctx = makeCtx(db);

    const result = await tool.handler(ctx, { subject: 'Test', message: 'Hello.' });

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(result.data!.recipientCount).toBe(1);
  });

  it('queries only the current org with disabled=false filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { userOrganization: { findMany } } as any;
    const tool = createSendStakeholderAlertTool({ emailService: makeEmailService() });
    const ctx = makeCtx(db);

    await tool.handler(ctx, { subject: 'Test', message: 'Hello.' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', disabled: false }),
      }),
    );
  });
});
