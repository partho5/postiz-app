/**
 * DirectActionHandler — multi-turn post creation flow
 *
 * State machine via ap_pending_action.waitingFor (3 states):
 *   'platforms' — ask which social platforms to post to
 *   'timing'    — ask when to post (startTime + optional intervalMinutes)
 *   'approval'  — show draft preview for all posts, await confirm / cancel
 *
 * On approval:
 *   - push() each post to ap_post_candidate (the stack) at priority 100
 *   - create a bare ap_scheduled_slot per post (postCandidateId = null)
 *   - the TriggerDueSlots cron pops from the stack when each slot fires
 *
 * No hardcoded post+time pairing. The stack and slots are fully decoupled.
 */

import { Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { Organization, User } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import type { LlmProvider } from '../skills/types';
import type { DirectActionData } from '../agents/intent_parser';
import { runCopywriter } from '../agents/copywriter';
import { push, ApPostCandidateStatus } from '../stack';
import { parseTimeExpression, formatForUser } from '../time/parse';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostEntry {
  topic: string;
  platform: string;
  content: string;
  hashtags?: string[];
  mediaUrl?: string;
}

interface CollectedData {
  topics?: string[];
  content?: string;
  platforms?: string[];
  startTime?: string;
  immediate?: boolean;
  intervalMinutes?: number;
  wantsImage?: boolean;
  imageUrl?: string;
  postStack?: PostEntry[];
  times?: string[];
  /** Natural-language time expressions, one per topic. Presence means per-post mode. */
  perPostTimes?: string[];
}

export type ChatDraftPreviewEvent = {
  type: 'draft_preview';
  pendingActionId: string;
  posts: Array<{
    topic: string;
    platform: string;
    content: string;
    hashtags?: string[];
    scheduledAt: string;
    mediaUrl?: string;
  }>;
  imageUrl?: string;
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
   * Entry point: start a new post-creation flow from a DirectActionData object.
   * Called by the schedule_post orchestrator tool.
   */
  async startFlow(
    org: Organization,
    _user: User,
    directAction: DirectActionData,
    llm: LlmProvider,
    emit: (event: EmitEvent) => void,
    timezone = 'UTC',
  ): Promise<string> {
    const availablePlatforms = await this._getAvailablePlatforms(org.id);

    const collected: CollectedData = {
      topics: directAction.topics?.length ? directAction.topics : undefined,
      content: directAction.content,
      platforms: directAction.platforms?.length
        ? this._matchPlatforms(directAction.platforms, availablePlatforms)
        : undefined,
      startTime: directAction.immediate ? undefined : directAction.startTime,
      immediate: directAction.immediate,
      intervalMinutes: directAction.intervalMinutes,
      wantsImage: directAction.wantsImage,
      perPostTimes: directAction.perPostTimes?.length ? directAction.perPostTimes : undefined,
    };

    return this._advance(org, collected, llm, availablePlatforms, emit, null, timezone);
  }

  /**
   * Entry point: resume a pending flow when the user answers a question.
   * Called by the orchestrator when a pending action exists.
   */
  async continuePending(
    org: Organization,
    pendingActionId: string,
    waitingFor: string,
    collectedRaw: unknown,
    userMessage: string,
    llm: LlmProvider,
    emit: (event: EmitEvent) => void,
    timezone = 'UTC',
  ): Promise<string> {
    const collected = (collectedRaw as CollectedData) ?? {};
    const availablePlatforms = await this._getAvailablePlatforms(org.id);

    switch (waitingFor) {
      case 'platforms': {
        const parsed = await this._parsePlatforms(userMessage, availablePlatforms, llm);
        collected.platforms = parsed.length ? parsed : availablePlatforms.slice(0, 1);
        break;
      }
      case 'timing': {
        const timing = await this._parseTiming(userMessage, llm);

        if (timing.timezone) {
          await this._prisma.organization.update({
            where: { id: org.id },
            data: { timezone: timing.timezone },
          });
          timezone = timing.timezone;
        }

        if (timing.perPostTimes?.length) {
          collected.perPostTimes = timing.perPostTimes;
          collected.immediate = undefined;
          collected.startTime = undefined;
          collected.intervalMinutes = undefined;
        } else {
          collected.immediate = timing.immediate;
          collected.startTime = timing.startTime;
          collected.intervalMinutes = timing.intervalMinutes;
        }
        break;
      }
      case 'approval': {
        await this._deletePendingAction(org.id);
        const msg = 'Post cancelled.';
        emit({ type: 'text', chunk: msg });
        return msg;
      }
    }

    return this._advance(org, collected, llm, availablePlatforms, emit, pendingActionId, timezone);
  }

  /**
   * Confirm a pending approval — push posts to stack, create bare slots.
   * Called from the HTTP confirm endpoint.
   */
  async confirmApproval(
    orgId: string,
    pendingActionId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const row = await this._prisma.apPendingAction.findFirst({
      where: { id: pendingActionId, organizationId: orgId, waitingFor: 'approval' },
    });

    if (!row) {
      return {
        ok: false,
        message: 'No pending post found — it may have already been posted or cancelled.',
      };
    }

    const org = await this._prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    const timezone = org?.timezone ?? 'UTC';

    const collected = row.collectedData as CollectedData;
    const postStack = collected.postStack ?? [];
    const times = collected.times ?? [];
    const isPerPost = (collected.perPostTimes?.length ?? 0) > 0;

    if (postStack.length === 0) {
      return { ok: false, message: 'Draft data missing — please try again.' };
    }

    if (isPerPost) {
      // Per-post mode: each candidate is pinned to its slot via postCandidateId.
      // Status SCHEDULED makes it invisible to popTop (which only selects PENDING).
      for (let i = 0; i < postStack.length; i++) {
        const post = postStack[i];
        const candidate = await push(this._prisma as any, orgId, post.platform, post.content, {
          priority: 100,
          source: 'chat_direct_action',
          status: ApPostCandidateStatus.SCHEDULED,
          metadata: {
            hashtags: post.hashtags ?? [],
            ...(post.mediaUrl ? { mediaUrl: post.mediaUrl } : {}),
            ...(collected.imageUrl ? { imageUrl: collected.imageUrl } : {}),
          },
        });
        const scheduledAt = times[i] ? new Date(times[i]) : new Date();
        await this._prisma.apScheduledSlot.create({
          data: {
            organizationId: orgId,
            platform: post.platform,
            scheduledAt,
            status: 'PENDING',
            postCandidateId: candidate.id,
            metadata: { source: 'chat_direct_action_per_post' },
          },
        });
      }
    } else {
      // Stack mode: push candidates as PENDING (eligible for any slot pop).
      // Slots are bare — cron picks the top candidate at fire time.
      for (const post of postStack) {
        await push(this._prisma as any, orgId, post.platform, post.content, {
          priority: 100,
          source: 'chat_direct_action',
          metadata: {
            hashtags: post.hashtags ?? [],
            ...(post.mediaUrl ? { mediaUrl: post.mediaUrl } : {}),
            ...(collected.imageUrl ? { imageUrl: collected.imageUrl } : {}),
          },
        });
      }
      for (let i = 0; i < postStack.length; i++) {
        const scheduledAt = times[i] ? new Date(times[i]) : new Date();
        await this._prisma.apScheduledSlot.create({
          data: {
            organizationId: orgId,
            platform: postStack[i].platform,
            scheduledAt,
            status: 'PENDING',
            metadata: { source: 'chat_direct_action' },
          },
        });
      }
    }

    await this._deletePendingAction(orgId);

    // Build confirmation message: all scheduled times in the org's timezone.
    const count = postStack.length;
    const now = new Date();
    const uniqueTimes = [...new Set(times)]; // each topic yields one time, dedup across platforms
    const timeLabels = uniqueTimes.map((t) =>
      formatForUser(new Date(t), { now, timezone }),
    );
    const timeList = timeLabels.join(', ');

    return {
      ok: true,
      message: count === 1
        ? `Queued — going out ${timeLabels[0] ?? 'now'}.`
        : `Queued ${count} posts. Slots: ${timeList}.`,
    };
  }

  /**
   * Cancel whatever pending action is active for this org.
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
    timezone = 'UTC',
  ): Promise<string> {

    // Step 1: Platforms.
    if (!collected.platforms?.length) {
      if (availablePlatforms.length === 0) {
        await this._deletePendingAction(org.id);
        const msg = 'No social accounts connected. Add one in Settings first.';
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
    const isPerPost = (collected.perPostTimes?.length ?? 0) > 0;
    if (!isPerPost && !collected.immediate && !collected.startTime) {
      await this._upsert(org.id, collected, 'timing', existingActionId);
      const msg = 'Post now or schedule it? (e.g. "now", "tomorrow 9am", "every hour from next hour")';
      emit({ type: 'text', chunk: msg });
      return msg;
    }

    // Step 3: Generate drafts and show preview.
    const topics = collected.topics?.length ? collected.topics : ['a social media post'];
    const platforms = collected.platforms ?? [];
    const intervalMs = (collected.intervalMinutes ?? 60) * 60_000;

    // Resolve start time (stack mode only).
    let startMs: number;
    if (isPerPost) {
      startMs = Date.now(); // unused in per-post mode; set for type safety
    } else if (collected.immediate) {
      startMs = Date.now();
    } else {
      const parsed = parseTimeExpression(collected.startTime!, {
        now: new Date(),
        timezone,
        forwardOnly: true,
      });
      startMs = parsed && !parsed.isPast ? parsed.date.getTime() : Date.now();
    }

    const platformLabel = platforms.join(', ');
    emit({
      type: 'status',
      message: `Writing ${topics.length > 1 ? `${topics.length} posts` : 'your post'} for ${platformLabel}…`,
    });

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

    const postStack: PostEntry[] = [];
    const times: string[] = [];

    // One slot per topic; all platforms share that slot time.
    let slotIndex = 0;
    for (const topic of topics) {
      let scheduledAt: string;
      if (isPerPost && collected.perPostTimes?.[slotIndex]) {
        const parsed = parseTimeExpression(collected.perPostTimes[slotIndex], {
          now: new Date(),
          timezone,
          forwardOnly: true,
        });
        scheduledAt = (parsed && !parsed.isPast ? parsed.date : new Date()).toISOString();
      } else {
        scheduledAt = new Date(startMs + slotIndex * intervalMs).toISOString();
      }

      for (const platform of platforms) {
        const postText = collected.content ?? topic;
        let content = postText;
        let hashtags: string[] | undefined;

        try {
          const output = await runCopywriter(agentCtx, {
            platform,
            topic: postText,
            count: 1,
          });
          const draft = output.drafts[0];
          if (draft) {
            content = draft.content;
            hashtags = draft.hashtags;
          }
        } catch (err) {
          this.logger.error(`Copywriter failed for "${topic}" on ${platform}: ${err}`);
        }

        postStack.push({ topic, platform, content, hashtags });
        times.push(scheduledAt);
      }

      slotIndex++;
    }

    collected.postStack = postStack;
    collected.times = times;

    const actionId = await this._upsert(org.id, collected, 'approval', existingActionId);

    emit({
      type: 'draft_preview',
      pendingActionId: actionId,
      posts: postStack.map((p, i) => ({
        topic: p.topic,
        platform: p.platform,
        content: p.content,
        hashtags: p.hashtags,
        scheduledAt: times[i],
        mediaUrl: p.mediaUrl,
      })),
      imageUrl: collected.imageUrl,
    });

    return '';
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
        platforms: z.array(z.string()).describe('Platform slugs the user wants to post to'),
      }),
      prompt: `Available platforms: ${available.join(', ')}.\nUser said: "${message}"\nReturn the matching platform slugs (lowercase). If unclear, return all.`,
      system: 'Extract which social media platforms the user wants to post to.',
    }).catch(() => ({ object: { platforms: available } }));

    const matched = object.platforms
      .map((p) => p.toLowerCase())
      .filter((p) => available.map((a) => a.toLowerCase()).includes(p));
    return matched.length > 0 ? matched : available;
  }

  private async _parseTiming(
    message: string,
    llm: LlmProvider,
  ): Promise<{
    immediate: boolean;
    startTime?: string;
    intervalMinutes?: number;
    perPostTimes?: string[];
    timezone?: string;
  }> {
    const { object } = await generateObject({
      model: llm.model,
      schema: z.object({
        immediate: z.boolean().describe('true only when user says "now", "right now", "asap", "immediately"'),
        startTime: z.string().optional().describe(
          'Single start time phrase when all posts share one time or a uniform interval (e.g. "tomorrow 9am", "next hour"). Omit when perPostTimes is used.',
        ),
        intervalMinutes: z.number().int().optional().describe(
          'Minutes between posts for a uniform series (e.g. 60 for hourly, 1440 for daily). Only set when startTime is also set.',
        ),
        perPostTimes: z.array(z.string()).optional().describe(
          'Use when user gives MULTIPLE DISTINCT times — one per post in order (e.g. ["11am","2pm","5pm"]). Do NOT set startTime when this is present.',
        ),
        timezone: z.string().optional().describe(
          'IANA timezone if mentioned (e.g. "GMT+6" → "Asia/Dhaka", "EST" → "America/New_York", "IST" → "Asia/Kolkata", "Bangladesh" → "Asia/Dhaka"). Omit if no timezone mentioned.',
        ),
      }),
      prompt: `User said: "${message}"\n\nExtract timing. Examples:\n- "now" → immediate=true\n- "tomorrow 9am" → startTime="tomorrow 9am"\n- "every hour from next hour" → startTime="next hour", intervalMinutes=60\n- "11am, 2pm, 5pm" → perPostTimes=["11am","2pm","5pm"]\n- "11am 2pm 5pm GMT+6" → perPostTimes=["11am","2pm","5pm"], timezone="Asia/Dhaka"`,
      system: 'Extract posting timing from the user message. Prefer perPostTimes for multiple distinct times, startTime+intervalMinutes for uniform series.',
    }).catch(() => ({ object: { immediate: true } }));

    return {
      immediate: object.immediate ?? false,
      startTime: (object as any).startTime,
      intervalMinutes: (object as any).intervalMinutes,
      perPostTimes: (object as any).perPostTimes,
      timezone: (object as any).timezone,
    };
  }

  // ---------------------------------------------------------------------------
  // Platform resolution
  // ---------------------------------------------------------------------------

  private async _getAvailablePlatforms(orgId: string): Promise<string[]> {
    const integrations = await this._prisma.integration.findMany({
      where: { organizationId: orgId, disabled: false, refreshNeeded: false, deletedAt: null },
      select: { providerIdentifier: true },
    });
    return [...new Set(integrations.map((i) => i.providerIdentifier))];
  }

  private _matchPlatforms(requested: string[], available: string[]): string[] {
    const availLower = available.map((a) => a.toLowerCase());
    return requested
      .map((r) => r.toLowerCase())
      .filter((r) => availLower.includes(r));
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
    const expiresAt = new Date(Date.now() + 30 * 60_000);

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
    await this._prisma.apPendingAction.deleteMany({ where: { organizationId: orgId } });
  }
}
