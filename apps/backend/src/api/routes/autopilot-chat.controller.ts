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
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApCadenceConfigSource,
  ApPostCandidate,
  ApPostCandidateStatus,
  ApScheduledSlotStatus,
  ApUpdatedBy,
  Organization,
  User,
} from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { AutopilotChatService, type ChatIngressInput } from '@gitroom/autopilot/chat/chat.service';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Controller('/autopilot')
export class AutopilotChatController {
  constructor(
    private readonly _chatService: AutopilotChatService,
    private readonly _prisma: PrismaService,
  ) {}

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
   * GET /autopilot/config
   * Return org-level autopilot settings (timezone, …).
   */
  @Get('/config')
  @HttpCode(200)
  async getConfig(
    @GetOrgFromRequest() org: Organization,
  ): Promise<{ timezone: string }> {
    return { timezone: org.timezone };
  }

  /**
   * PATCH /autopilot/config
   * Update org-level autopilot settings.
   * Body: { timezone?: string }  — IANA timezone string, e.g. "Asia/Dhaka".
   */
  @Patch('/config')
  @HttpCode(200)
  async updateConfig(
    @Body() body: { timezone?: string },
    @GetOrgFromRequest() org: Organization,
  ): Promise<{ timezone: string }> {
    if (body.timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
      } catch {
        throw new BadRequestException(`Invalid IANA timezone: "${body.timezone}"`);
      }
      await this._prisma.organization.update({
        where: { id: org.id },
        data: { timezone: body.timezone },
      });
      return { timezone: body.timezone };
    }
    return { timezone: org.timezone };
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

  /**
   * GET /autopilot/stack
   * List all post candidates for the tenant, ordered by priority then age.
   */
  @Get('/stack')
  @HttpCode(200)
  async getStack(
    @GetOrgFromRequest() org: Organization,
  ) {
    const candidates = await this._prisma.apPostCandidate.findMany({
      where: { organizationId: org.id },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        apScheduledSlot: {
          where: { status: ApScheduledSlotStatus.PENDING },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: { scheduledAt: true },
        },
        apPublishedPost: {
          take: 1,
          select: { publishedAt: true },
        },
      },
    });
    return { candidates };
  }

  /**
   * PATCH /autopilot/stack/:id
   * Update content and/or priority of a post candidate.
   */
  @Patch('/stack/:id')
  @HttpCode(200)
  async updateStackItem(
    @Param('id') id: string,
    @Body() body: { content?: string; priority?: number },
    @GetOrgFromRequest() org: Organization,
  ): Promise<ApPostCandidate> {
    await this._prisma.apPostCandidate.updateMany({
      where: { id, organizationId: org.id },
      data: {
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
      },
    });
    return this._prisma.apPostCandidate.findFirstOrThrow({
      where: { id, organizationId: org.id },
    });
  }

  /**
   * DELETE /autopilot/stack/:id
   * Remove a post candidate from the stack.
   */
  @Delete('/stack/:id')
  @HttpCode(204)
  async deleteStackItem(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<void> {
    await this._prisma.apPostCandidate.deleteMany({
      where: { id, organizationId: org.id },
    });
  }

  // ── Scheduled Slots ────────────────────────────────────────────────────────

  /**
   * GET /autopilot/slots
   * Upcoming PENDING slots ordered by scheduledAt.
   * type: 'pinned' when postCandidateId is set, 'stack' otherwise.
   */
  @Get('/slots')
  @HttpCode(200)
  async getSlots(
    @GetOrgFromRequest() org: Organization,
  ) {
    const slots = await this._prisma.apScheduledSlot.findMany({
      where: { organizationId: org.id, status: ApScheduledSlotStatus.PENDING },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
      select: {
        id: true,
        platform: true,
        scheduledAt: true,
        postCandidateId: true,
        metadata: true,
      },
    });
    return {
      slots: slots.map((s) => ({
        ...s,
        type: s.postCandidateId ? 'pinned' : 'stack',
      })),
    };
  }

  /**
   * DELETE /autopilot/slots/:id
   * Cancel a PENDING slot. If it was a per-post slot, return the candidate
   * to PENDING so it re-enters the stack.
   */
  @Delete('/slots/:id')
  @HttpCode(204)
  async deleteSlot(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<void> {
    const slot = await this._prisma.apScheduledSlot.findFirst({
      where: { id, organizationId: org.id, status: ApScheduledSlotStatus.PENDING },
      select: { id: true, postCandidateId: true },
    });
    if (!slot) return;

    await this._prisma.apScheduledSlot.update({
      where: { id: slot.id },
      data: { status: ApScheduledSlotStatus.CANCELLED },
    });

    if (slot.postCandidateId) {
      await this._prisma.apPostCandidate.updateMany({
        where: { id: slot.postCandidateId, organizationId: org.id, status: ApPostCandidateStatus.SCHEDULED },
        data: { status: ApPostCandidateStatus.PENDING },
      });
    }
  }

  // ── Cadence config ─────────────────────────────────────────────────────────

  /**
   * GET /autopilot/cadence
   * Returns cadence config for every connected platform.
   * Platforms without a row get isDefault:true with sensible defaults.
   */
  @Get('/cadence')
  @HttpCode(200)
  async getCadence(
    @GetOrgFromRequest() org: Organization,
  ) {
    const integrations = await this._prisma.integration.findMany({
      where: { organizationId: org.id, disabled: false, refreshNeeded: false, deletedAt: null },
      select: { providerIdentifier: true },
    });
    const platforms = [...new Set(integrations.map((i) => i.providerIdentifier))];

    const rows = await this._prisma.apCadenceConfig.findMany({
      where: { organizationId: org.id },
    });
    const rowsByPlatform = new Map(rows.map((r) => [r.platform, r]));

    return {
      cadence: platforms.map((platform) => {
        const row = rowsByPlatform.get(platform);
        if (row) return { ...row, isDefault: false };
        return {
          id: null,
          organizationId: org.id,
          platform,
          postsPerDay: 1,
          preferredTimes: [],
          timezone: org.timezone,
          pausedUntil: null,
          active: true,
          source: 'DEFAULT' as const,
          version: 1,
          createdAt: null,
          updatedAt: null,
          isDefault: true,
        };
      }),
    };
  }

  /**
   * PATCH /autopilot/cadence/:platform
   * Upsert cadence config for a platform.
   */
  @Patch('/cadence/:platform')
  @HttpCode(200)
  async upsertCadence(
    @Param('platform') platform: string,
    @Body() body: {
      postsPerDay?: number;
      preferredTimes?: { time: number }[];
      timezone?: string;
      active?: boolean;
      pausedUntil?: string | null;
    },
    @GetOrgFromRequest() org: Organization,
  ) {
    if (body.timezone !== undefined) {
      try { Intl.DateTimeFormat(undefined, { timeZone: body.timezone }); }
      catch { throw new BadRequestException(`Invalid timezone: "${body.timezone}"`); }
    }
    const data = {
      ...(body.postsPerDay !== undefined ? { postsPerDay: body.postsPerDay } : {}),
      ...(body.preferredTimes !== undefined ? { preferredTimes: body.preferredTimes } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.pausedUntil !== undefined ? { pausedUntil: body.pausedUntil ? new Date(body.pausedUntil) : null } : {}),
      source: ApCadenceConfigSource.USER,
    };
    return this._prisma.apCadenceConfig.upsert({
      where: { organizationId_platform: { organizationId: org.id, platform } },
      create: {
        organizationId: org.id,
        platform,
        postsPerDay: body.postsPerDay ?? 1,
        preferredTimes: body.preferredTimes ?? [],
        timezone: body.timezone ?? org.timezone,
        active: body.active ?? true,
        pausedUntil: body.pausedUntil ? new Date(body.pausedUntil) : null,
        source: ApCadenceConfigSource.USER,
      },
      update: data,
    });
  }

  // ── Business Profile ───────────────────────────────────────────────────────

  /**
   * GET /autopilot/profile
   * Returns the business profile, or defaults if none exists.
   */
  @Get('/profile')
  @HttpCode(200)
  async getProfile(
    @GetOrgFromRequest() org: Organization,
  ) {
    const row = await this._prisma.apBusinessProfile.findUnique({
      where: { organizationId: org.id },
    });
    if (row) return { ...row, isDefault: false };
    return {
      organizationId: org.id,
      niche: '',
      brandVoiceShort: '',
      brandVoiceExtended: '',
      goals: [] as string[],
      antiPatterns: [] as string[],
      regulatoryFlags: [] as string[],
      updatedBy: null as string | null,
      updatedAt: null as Date | null,
      isDefault: true,
    };
  }

  /**
   * PATCH /autopilot/profile
   * Upsert the business profile.
   */
  @Patch('/profile')
  @HttpCode(200)
  async updateProfile(
    @Body() body: {
      niche?: string;
      brandVoiceShort?: string;
      brandVoiceExtended?: string;
      goals?: string[];
      antiPatterns?: string[];
      regulatoryFlags?: string[];
    },
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._prisma.apBusinessProfile.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        niche: body.niche ?? '',
        brandVoiceShort: body.brandVoiceShort ?? '',
        brandVoiceExtended: body.brandVoiceExtended ?? '',
        goals: body.goals ?? [],
        antiPatterns: body.antiPatterns ?? [],
        regulatoryFlags: body.regulatoryFlags ?? [],
        updatedBy: ApUpdatedBy.USER,
      },
      update: {
        ...(body.niche !== undefined ? { niche: body.niche } : {}),
        ...(body.brandVoiceShort !== undefined ? { brandVoiceShort: body.brandVoiceShort } : {}),
        ...(body.brandVoiceExtended !== undefined ? { brandVoiceExtended: body.brandVoiceExtended } : {}),
        ...(body.goals !== undefined ? { goals: body.goals } : {}),
        ...(body.antiPatterns !== undefined ? { antiPatterns: body.antiPatterns } : {}),
        ...(body.regulatoryFlags !== undefined ? { regulatoryFlags: body.regulatoryFlags } : {}),
        updatedBy: ApUpdatedBy.USER,
      },
    });
  }

  // ── Growth Rules ───────────────────────────────────────────────────────────

  /** GET /autopilot/rules */
  @Get('/rules')
  @HttpCode(200)
  async getRules(@GetOrgFromRequest() org: Organization) {
    return {
      rules: await this._prisma.apGrowthRule.findMany({
        where: { organizationId: org.id },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  /** POST /autopilot/rules */
  @Post('/rules')
  @HttpCode(201)
  async createRule(
    @Body() body: { ruleKey: string; ruleValue: unknown; active?: boolean },
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._prisma.apGrowthRule.create({
      data: {
        organizationId: org.id,
        ruleKey: body.ruleKey,
        ruleValue: body.ruleValue as object,
        active: body.active ?? true,
        source: 'USER' as const,
      },
    });
  }

  /** PATCH /autopilot/rules/:id */
  @Patch('/rules/:id')
  @HttpCode(200)
  async updateRule(
    @Param('id') id: string,
    @Body() body: { ruleKey?: string; ruleValue?: unknown; active?: boolean },
    @GetOrgFromRequest() org: Organization,
  ) {
    await this._prisma.apGrowthRule.updateMany({
      where: { id, organizationId: org.id },
      data: {
        ...(body.ruleKey !== undefined ? { ruleKey: body.ruleKey } : {}),
        ...(body.ruleValue !== undefined ? { ruleValue: body.ruleValue as object } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        source: 'USER' as const,
      },
    });
    return this._prisma.apGrowthRule.findFirstOrThrow({ where: { id, organizationId: org.id } });
  }

  /** DELETE /autopilot/rules/:id */
  @Delete('/rules/:id')
  @HttpCode(204)
  async deleteRule(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<void> {
    await this._prisma.apGrowthRule.deleteMany({ where: { id, organizationId: org.id } });
  }

  // ── Memory ─────────────────────────────────────────────────────────────────

  /**
   * GET /autopilot/memory
   * List memory entries — embeddings excluded (too large for the wire).
   */
  @Get('/memory')
  @HttpCode(200)
  async getMemory(@GetOrgFromRequest() org: Organization) {
    const rows = await this._prisma.$queryRaw<
      Array<{ id: string; kind: string; content: string; createdAt: Date; sourceRef: unknown }>
    >`
      SELECT id, kind, content, "createdAt", "sourceRef"
      FROM ap_memory_vector
      WHERE "organizationId" = ${org.id}
      ORDER BY "createdAt" DESC
      LIMIT 200
    `;
    return { memories: rows };
  }

  /** DELETE /autopilot/memory/:id */
  @Delete('/memory/:id')
  @HttpCode(204)
  async deleteMemory(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ): Promise<void> {
    await this._prisma.$executeRaw`
      DELETE FROM ap_memory_vector
      WHERE id = ${id} AND "organizationId" = ${org.id}
    `;
  }

  // ── Strategy optout ────────────────────────────────────────────────────────

  /**
   * GET /autopilot/strategy-optout
   * Returns whether the org has opted out of anonymized strategy data sharing.
   */
  @Get('/strategy-optout')
  @HttpCode(200)
  async getStrategyOptoutDirect(@GetOrgFromRequest() org: Organization) {
    const row = await this._prisma.apTenantStrategyOptout.findUnique({
      where: { organizationId: org.id },
    });
    return { optedOut: !!row };
  }

  /**
   * PATCH /autopilot/strategy-optout
   * Body: { optedOut: boolean }
   */
  @Patch('/strategy-optout')
  @HttpCode(200)
  async setStrategyOptout(
    @Body() body: { optedOut: boolean },
    @GetOrgFromRequest() org: Organization,
  ) {
    if (body.optedOut) {
      await this._prisma.apTenantStrategyOptout.upsert({
        where: { organizationId: org.id },
        create: { organizationId: org.id },
        update: {},
      });
    } else {
      await this._prisma.apTenantStrategyOptout.deleteMany({
        where: { organizationId: org.id },
      });
    }
    return { optedOut: body.optedOut };
  }
}
