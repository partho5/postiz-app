/**
 * DirectActionHandler — multi-turn post creation flow (slice 5.x)
 *
 * State machine via ap_pending_action.waitingFor:
 *   'platforms'     — ask which social platforms to post to
 *   'timing'        — ask when to post (now vs. specific time)
 *   'image_consent' — ask if the user wants an AI-generated image
 *   'approval'      — show draft preview, await Post it / Cancel
 *
 * On approval: create ApPostCandidate rows + ApScheduledSlot per platform
 * so the existing pop-and-publish cron picks them up automatically.
 */

import { Injectable, Logger } from '@nestjs/common';
import { generateObject, generateText } from 'ai-v5';
import { z } from 'zod';
import { Organization, User } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import type { LlmProvider } from '../skills/types';
import type { DirectActionData } from '../agents/intent_parser';
import { runCopywriter } from '../agents/copywriter';
import { isImageGenAvailable, generateImage } from '../image-gen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollectedData {
  topic?: string;
  content?: string;
  platforms?: string[];
  publishImmediately?: boolean;
  scheduleAt?: string;
  countPerPlatform?: number;
  wantsImage?: boolean;
  imageUrl?: string;
  drafts?: Array<{ platform: string; content: string; hashtags?: string[] }>;
}

export type ChatDraftPreviewEvent = {
  type: 'draft_preview';
  pendingActionId: string;
  drafts: Array<{ platform: string; content: string; hashtags?: string[] }>;
  imageUrl?: string;
  publishAt: string;
};

export type ChatTextChunk = { type: 'text'; chunk: string };
export type ChatErrorChunk = { type: 'error'; message: string };
export type ChatStatusChunk = { type: 'status'; message: string };
type EmitEvent = ChatDraftPreviewEvent | ChatTextChunk | ChatErrorChunk | ChatStatusChunk;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DirectActionHandler {
  private readonly logger = new Logger(DirectActionHandler.name);

  constructor(private readonly _prisma: PrismaService) {}

  /**
   * Entry point when intent = direct_action and no existing pending action.
   * Returns the assistant's reply text (empty string if draft_preview was emitted).
   */
  async startFlow(
    org: Organization,
    _user: User,
    directAction: DirectActionData,
    llm: LlmProvider,
    emit: (event: EmitEvent) => void,
  ): Promise<string> {
    const availablePlatforms = await this._getAvailablePlatforms(org.id);

    // Normalize timing: accept publishImmediately=true as-is;
    // for scheduleAt, only keep it if it parses as a valid future ISO date.
    // Anything else → leave both undefined so the state machine asks.
    const publishImmediately: boolean | undefined =
      directAction.publishImmediately === true ? true : undefined;
    let scheduleAt: string | undefined;
    if (!publishImmediately && directAction.scheduleAt) {
      const d = new Date(directAction.scheduleAt);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
        scheduleAt = d.toISOString();
      }
    }

    const collected: CollectedData = {
      topic: directAction.topic,
      content: directAction.content,
      platforms: directAction.platforms?.length
        ? this._matchPlatforms(directAction.platforms, availablePlatforms)
        : undefined,
      publishImmediately,
      scheduleAt,
      countPerPlatform: directAction.countPerPlatform ?? 1,
      wantsImage: directAction.wantsImage,
    };

    return this._advance(org, collected, llm, availablePlatforms, emit, null);
  }

  /**
   * Entry point when a pending action already exists for this tenant.
   * Parses the user message in the context of the current state and advances.
   * Returns the assistant's reply text.
   */
  async continuePending(
    org: Organization,
    pendingActionId: string,
    waitingFor: string,
    collectedRaw: unknown,
    userMessage: string,
    llm: LlmProvider,
    emit: (event: EmitEvent) => void,
  ): Promise<string> {
    const collected = (collectedRaw as CollectedData) ?? {};
    const availablePlatforms = await this._getAvailablePlatforms(org.id);

    switch (waitingFor) {
      case 'platforms': {
        const parsed = await this._parsePlatforms(
          userMessage,
          availablePlatforms,
          llm,
        );
        collected.platforms = parsed.length ? parsed : availablePlatforms.slice(0, 1);
        break;
      }
      case 'timing': {
        const timing = await this._parseTiming(userMessage, llm);
        collected.publishImmediately = timing.immediately;
        if (!timing.immediately && timing.scheduleAt) {
          collected.scheduleAt = timing.scheduleAt;
        }
        break;
      }
      case 'image_consent': {
        collected.wantsImage = await this._parseYesNo(userMessage, llm);
        break;
      }
      case 'approval': {
        // Treat any freeform message in approval state as cancel.
        await this._deletePendingAction(org.id);
        const msg = "Post cancelled.";
        emit({ type: 'text', chunk: msg });
        return msg;
      }
    }

    return this._advance(org, collected, llm, availablePlatforms, emit, pendingActionId);
  }

  /**
   * Called from the HTTP confirm endpoint after user clicks "Post it".
   */
  async confirmApproval(
    orgId: string,
    pendingActionId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const row = await this._prisma.apPendingAction.findFirst({
      where: { id: pendingActionId, organizationId: orgId, waitingFor: 'approval' },
    });

    if (!row) {
      return { ok: false, message: 'No pending post found — it may have already been posted or cancelled.' };
    }

    const collected = row.collectedData as CollectedData;
    const drafts = collected.drafts ?? [];
    const platforms = collected.platforms ?? [];

    if (drafts.length === 0 || platforms.length === 0) {
      return { ok: false, message: 'Draft data missing — please try again.' };
    }

    // Resolve publish time.
    const publishAt = collected.publishImmediately
      ? new Date()
      : this._parseIsoDate(collected.scheduleAt) ?? new Date();

    const immediateOrNear = publishAt.getTime() <= Date.now() + 5 * 60_000;
    const candidatePriority = immediateOrNear ? 999 : 100;

    for (const draft of drafts) {
      // Create a post candidate on the stack.
      const candidate = await this._prisma.apPostCandidate.create({
        data: {
          organizationId: orgId,
          platform: draft.platform,
          content: draft.content,
          contentVariants: {},
          mediaUrls: collected.imageUrl ? [collected.imageUrl] : [],
          status: 'PENDING',
          priority: candidatePriority,
          source: 'chat_direct_action',
          metadata: { hashtags: draft.hashtags ?? [] },
        },
      });

      // Create a scheduled slot for this platform.
      await this._prisma.apScheduledSlot.create({
        data: {
          organizationId: orgId,
          platform: draft.platform,
          scheduledAt: publishAt,
          status: 'PENDING',
          postCandidateId: candidate.id,
          metadata: { source: 'chat_direct_action' },
        },
      });
    }

    await this._deletePendingAction(orgId);

    const timeLabel = immediateOrNear
      ? 'now'
      : publishAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return {
      ok: true,
      message: drafts.length > 1
        ? `Queued ${drafts.length} posts — going out ${timeLabel}.`
        : `Queued — going out ${timeLabel}.`,
    };
  }

  /**
   * Cancel whatever is pending for this org.
   */
  async cancelAction(orgId: string): Promise<void> {
    await this._deletePendingAction(orgId);
  }

  // ---------------------------------------------------------------------------
  // State machine core
  // ---------------------------------------------------------------------------

  private async _advance(
    org: Organization,
    collected: CollectedData,
    llm: LlmProvider,
    availablePlatforms: string[],
    emit: (event: EmitEvent) => void,
    existingActionId: string | null,
  ): Promise<string> {
    // Step 1: Platforms.
    if (!collected.platforms?.length) {
      if (availablePlatforms.length === 0) {
        await this._deletePendingAction(org.id);
        const msg = "No social accounts connected. Add one in Settings first.";
        emit({ type: 'text', chunk: msg });
        return msg;
      }
      if (availablePlatforms.length === 1) {
        collected.platforms = availablePlatforms;
      } else {
        await this._upsert(org.id, collected, 'platforms', existingActionId);
        const list = availablePlatforms.join(', ');
        const msg = `Which account — ${list}?`;
        emit({ type: 'text', chunk: msg });
        return msg;
      }
    }

    // Step 2: Timing.
    if (collected.publishImmediately === undefined && !collected.scheduleAt) {
      await this._upsert(org.id, collected, 'timing', existingActionId);
      const msg = 'Post now or schedule it? (e.g. "now", "tomorrow 9am", "Friday 3pm")';
      emit({ type: 'text', chunk: msg });
      return msg;
    }

    // Step 3: Image consent (only if image gen is configured).
    if (collected.wantsImage === undefined) {
      let imageAvailable = false;
      try {
        imageAvailable = await isImageGenAvailable(this._prisma, org.id);
      } catch {
        // ignore
      }
      if (imageAvailable) {
        await this._upsert(org.id, collected, 'image_consent', existingActionId);
        const msg = 'Add an AI-generated image?';
        emit({ type: 'text', chunk: msg });
        return msg;
      }
      collected.wantsImage = false;
    }

    // Step 4: Generate draft(s) and show preview.
    const platformList = (collected.platforms ?? []).join(', ');
    emit({ type: 'status', message: `Writing your ${platformList} post…` });

    const drafts = await this._generateDrafts(org, collected, llm);
    collected.drafts = drafts;

    if (collected.wantsImage && collected.topic) {
      emit({ type: 'status', message: 'Generating image…' });
      try {
        collected.imageUrl = await generateImage(
          this._prisma,
          org.id,
          collected.topic,
        );
      } catch (err) {
        this.logger.warn(`Image generation skipped: ${err}`);
      }
    }

    const actionId = await this._upsert(org.id, collected, 'approval', existingActionId);

    const publishAt = collected.publishImmediately
      ? 'now'
      : (collected.scheduleAt ?? 'now');

    emit({
      type: 'draft_preview',
      pendingActionId: actionId,
      drafts,
      imageUrl: collected.imageUrl,
      publishAt,
    });

    return '';
  }

  // ---------------------------------------------------------------------------
  // Draft generation
  // ---------------------------------------------------------------------------

  private async _generateDrafts(
    org: Organization,
    collected: CollectedData,
    llm: LlmProvider,
  ): Promise<Array<{ platform: string; content: string; hashtags?: string[] }>> {
    const platforms = collected.platforms ?? [];
    const topic = collected.topic ?? 'a social media post';
    const count = collected.countPerPlatform ?? 1;

    const agentCtx = {
      tenant: org,
      user: {} as User,
      db: this._prisma as any,
      llm,
      logger: {
        info: (m: string) => this.logger.log(m),
        warn: (m: string) => this.logger.warn(m),
        error: (m: string) => this.logger.error(m),
        debug: (m: string) => this.logger.debug(m),
      },
    };

    const results: Array<{ platform: string; content: string; hashtags?: string[] }> = [];

    for (const platform of platforms) {
      try {
        const output = await runCopywriter(agentCtx, {
          platform,
          topic: collected.content ?? topic,
          count,
        });
        const best = output.drafts[0];
        if (best) {
          results.push({
            platform,
            content: best.content,
            hashtags: best.hashtags,
          });
        }
      } catch (err) {
        this.logger.error(`Copywriter failed for ${platform}: ${err}`);
        results.push({ platform, content: collected.content ?? topic });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // NLU helpers
  // ---------------------------------------------------------------------------

  private async _parsePlatforms(
    message: string,
    available: string[],
    llm: LlmProvider,
  ): Promise<string[]> {
    if (available.length === 0) return [];

    const { object } = await generateObject({
      model: llm.model,
      schema: z.object({
        platforms: z
          .array(z.string())
          .describe('Platform slugs the user wants to post to'),
      }),
      prompt: `Available platforms: ${available.join(', ')}.\nUser said: "${message}"\nReturn the matching platform slugs (lowercase, no spaces). If user says "all" or "everywhere" return all available. If unclear, return all.`,
      system:
        'Extract which social media platforms the user wants to post to. Return only slugs from the available list.',
    }).catch(() => ({ object: { platforms: available } }));

    const matched = object.platforms
      .map((p) => p.toLowerCase())
      .filter((p) => available.map((a) => a.toLowerCase()).includes(p));
    return matched.length > 0 ? matched : available;
  }

  private async _parseTiming(
    message: string,
    llm: LlmProvider,
  ): Promise<{ immediately: boolean; scheduleAt?: string }> {
    const nowIso = new Date().toISOString();

    const fallback = { immediately: true as const };

    const { object } = await generateObject({
      model: llm.model,
      schema: z.object({
        immediately: z.boolean().describe('true if user wants to post right now'),
        scheduleAt: z
          .string()
          .optional()
          .describe('ISO 8601 datetime when user wants to post (only if not immediately)'),
      }),
      prompt: `Current UTC time: ${nowIso}\nUser said: "${message}"\nExtract posting timing.`,
      system:
        'Determine when the user wants to post. If they say "now", "immediately", "right now", "asap" → immediately=true. Otherwise parse the time and return ISO 8601. When in doubt, default to immediately=true.',
    }).catch(() => ({ object: fallback }));

    return { immediately: object.immediately ?? true, scheduleAt: (object as { scheduleAt?: string }).scheduleAt };
  }

  private async _parseYesNo(message: string, llm: LlmProvider): Promise<boolean> {
    const { object } = await generateObject({
      model: llm.model,
      schema: z.object({
        yes: z.boolean().describe('true if user agrees / says yes'),
      }),
      prompt: `User said: "${message}". Did they say yes or agree?`,
      system:
        'Determine if the user said yes. "yes", "sure", "go ahead", "ok", "yep", "please" → yes. "no", "skip", "nope", "don\'t" → no.',
    }).catch(() => ({ object: { yes: false } }));

    return object.yes;
  }

  // ---------------------------------------------------------------------------
  // Platform resolution
  // ---------------------------------------------------------------------------

  private async _getAvailablePlatforms(orgId: string): Promise<string[]> {
    const integrations = await this._prisma.integration.findMany({
      where: {
        organizationId: orgId,
        disabled: false,
        refreshNeeded: false,
        deletedAt: null,
      },
      select: { providerIdentifier: true },
    });
    return [...new Set(integrations.map((i) => i.providerIdentifier))];
  }

  private _matchPlatforms(requested: string[], available: string[]): string[] {
    const availLower = available.map((a) => a.toLowerCase());
    const matched = requested
      .map((r) => r.toLowerCase())
      .filter((r) => availLower.includes(r));
    return matched.length > 0 ? matched : [];
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  private async _upsert(
    orgId: string,
    collected: CollectedData,
    waitingFor: string,
    existingId: string | null,
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min TTL

    if (existingId) {
      await this._prisma.apPendingAction.update({
        where: { id: existingId },
        data: { collectedData: collected as any, waitingFor, expiresAt },
      });
      return existingId;
    }

    const existing = await this._prisma.apPendingAction.findUnique({
      where: { organizationId: orgId },
    });

    if (existing) {
      await this._prisma.apPendingAction.update({
        where: { id: existing.id },
        data: { collectedData: collected as any, waitingFor, expiresAt },
      });
      return existing.id;
    }

    const row = await this._prisma.apPendingAction.create({
      data: {
        organizationId: orgId,
        actionType: 'post',
        collectedData: collected as any,
        waitingFor,
        expiresAt,
      },
    });
    return row.id;
  }

  private async _deletePendingAction(orgId: string): Promise<void> {
    await this._prisma.apPendingAction.deleteMany({
      where: { organizationId: orgId },
    });
  }

  private _parseIsoDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}
