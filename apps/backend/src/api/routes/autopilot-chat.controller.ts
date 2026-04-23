/**
 * AutopilotChatController — slice 1.8
 *
 * POST /autopilot/chat
 *   Body:    { content: string; source?: 'web' | 'telegram' | 'api' }
 *   Returns: text/event-stream (Server-Sent Events)
 *
 * Event shapes (JSON-encoded in the `data:` field):
 *   { type: 'text',     chunk: string }
 *   { type: 'proposal', proposalId: string, rationale: string,
 *                        targetEntity: string, changes: object }
 *   { type: 'done',     assistantMessageId: string }
 *   { type: 'error',    message: string }
 *
 * Example curl test:
 *   curl -N -X POST http://localhost:3000/autopilot/chat \
 *     -H 'Content-Type: application/json' \
 *     -H 'auth: <jwt>' \
 *     -d '{"content":"What should I post today?","source":"web"}'
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { AutopilotChatService, type ChatIngressInput } from '@gitroom/autopilot/chat/chat.service';

@Controller('/autopilot')
export class AutopilotChatController {
  constructor(private readonly _chatService: AutopilotChatService) {}

  @Post('/chat')
  async chat(
    @Body() body: ChatIngressInput,
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request & { user: User },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const write = (event: object): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this._chatService.handleChat(org, req.user, body, write);
    } catch (err) {
      write({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.end();
    }
  }

  /**
   * PATCH /autopilot/chat/proposals/:id/confirm
   * Confirm a pending proposal.  Returns { ok, message? }.
   */
  @Patch('/chat/proposals/:id/confirm')
  @HttpCode(200)
  async confirmProposal(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<{ ok: boolean; message?: string }> {
    const result = await this._chatService.confirmProposal(id, org.id);
    if (!result.ok) {
      const { message } = result as { ok: false; reason: string; message: string };
      return { ok: false, message };
    }
    return { ok: true };
  }

  /**
   * PATCH /autopilot/chat/proposals/:id/cancel
   * Cancel a pending proposal.  Returns 204.
   */
  @Patch('/chat/proposals/:id/cancel')
  @HttpCode(204)
  async cancelProposal(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<void> {
    await this._chatService.cancelProposal(id, org.id);
  }

  /**
   * GET /autopilot/chat/history
   * Return recent chat messages (user + assistant) for the tenant.
   * Response: { messages: Array<{ id, role, content, createdAt }> }
   */
  @Get('/chat/history')
  @HttpCode(200)
  async getChatHistory(
    @GetOrgFromRequest() org: Organization,
  ): Promise<{ messages: { id: string; role: string; content: string; createdAt: string }[] }> {
    return this._chatService.getHistory(org.id);
  }

  /**
   * GET /autopilot/chat/settings/strategy-optout
   * Return the tenant's current strategy-pattern contribution opt-out status.
   * Response: { optedOut: boolean }
   */
  @Get('/chat/settings/strategy-optout')
  @HttpCode(200)
  async getStrategyOptout(
    @GetOrgFromRequest() org: Organization,
  ): Promise<{ optedOut: boolean }> {
    return this._chatService.getStrategyOptoutStatus(org.id);
  }

  /**
   * PATCH /autopilot/chat/pending-actions/:id/confirm
   * Approve a draft post — queues it for publishing.
   * Response: { ok: boolean, message: string }
   */
  @Patch('/chat/pending-actions/:id/confirm')
  @HttpCode(200)
  async confirmPost(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<{ ok: boolean; message: string }> {
    return this._chatService.confirmPost(id, org.id);
  }

  /**
   * PATCH /autopilot/chat/pending-actions/cancel
   * Cancel whatever pending post action is active for the tenant.
   */
  @Patch('/chat/pending-actions/cancel')
  @HttpCode(204)
  async cancelPost(
    @GetOrgFromRequest() org: Organization,
  ): Promise<void> {
    await this._chatService.cancelPost(org.id);
  }
}
