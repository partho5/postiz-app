/**
 * `send_stakeholder_alert` tool — slice E.9
 *
 * Sends an email alert to all active members of the org (fetched via
 * `userOrganization`) using the existing EmailService (Resend / nodemailer).
 *
 * Use for: "notify the team about X", "send an internal alert to stakeholders",
 * "email everyone about the crisis".
 * NOT for posting to social media — use draft_apology_post or schedule_post for that.
 * NOT for listing org members — this only sends; no read tool is created here.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  subject: z.string().min(1).describe('Email subject line for the alert.'),
  message: z
    .string()
    .min(1)
    .describe('Body of the alert. Plain text; will be wrapped in basic HTML.'),
});

export type SendStakeholderAlertInput = z.infer<typeof inputSchema>;

export interface SendStakeholderAlertOutput {
  recipientCount: number;
  recipients: string[];
  sent: boolean;
}

export interface SendStakeholderAlertDeps {
  emailService: EmailService;
}

export function createSendStakeholderAlertTool(
  deps: SendStakeholderAlertDeps,
): OrchestratorTool<SendStakeholderAlertInput, SendStakeholderAlertOutput> {
  return {
    name: 'send_stakeholder_alert',
    description:
      'Send an email alert to all active org members (internal stakeholders). ' +
      'Use during a crisis to notify the team. ' +
      'NOT for posting to social media — use draft_apology_post or schedule_post for public posts.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;

      const memberships = await db.userOrganization.findMany({
        where: { organizationId: ctx.org.id, disabled: false },
        include: { user: true },
      });

      const emails = memberships
        .map((m) => m.user.email)
        .filter((e): e is string => typeof e === 'string' && e.includes('@'));

      if (emails.length === 0) {
        ctx.emit({
          type: 'action_result',
          action: 'send_stakeholder_alert',
          ok: false,
          message: 'No active org members with email addresses found. No alerts sent.',
        });

        return {
          observation: 'No active org members with valid email addresses found. Alert not sent.',
          data: { recipientCount: 0, recipients: [], sent: false },
          emitted: true,
        };
      }

      const html = `<p>${input.message.replace(/\n/g, '<br/>')}</p>`;

      let successCount = 0;
      for (const email of emails) {
        try {
          await deps.emailService.sendEmail(email, input.subject, html);
          successCount++;
        } catch (err) {
          ctx.logger.info(
            `send_stakeholder_alert: failed to send to ${email}: ${(err as Error).message}`,
          );
        }
      }

      ctx.logger.info(
        `send_stakeholder_alert: org=${ctx.org.id} subject="${input.subject}" sent=${successCount}/${emails.length}`,
      );

      const ok = successCount === emails.length;
      const message = ok
        ? `Alert sent to ${successCount} stakeholder${successCount !== 1 ? 's' : ''}.`
        : `Alert sent to ${successCount} of ${emails.length} stakeholders (${emails.length - successCount} failed).`;

      ctx.emit({
        type: 'action_result',
        action: 'send_stakeholder_alert',
        ok,
        message,
      });

      return {
        observation: message,
        data: { recipientCount: successCount, recipients: emails, sent: successCount > 0 },
        emitted: true,
      };
    },
  };
}
