/**
 * AutopilotChatService — slice 1.8 + 1.12 (onboarding)
 *
 * Handles the full chat ingress lifecycle for one user message:
 *   1. Persist user message  → ap_chat_message (role: USER)
 *   2. Acquire LLM provider  → createLlmProvider()
 *   3. Load tenant context   → getStructuredProfile()
 *   4. Route:
 *      - First-run (no business_profile) → onboarding agent (slice 1.12)
 *      - Normal                          → intent parser (slice 1.3)
 *   5a. config_change_request / onboarding propose → createProposal(), emit proposal
 *   5b. other intents / onboarding ask             → streamText(), emit text chunks
 *   6. Persist assistant msg → ap_chat_message (role: ASSISTANT)
 *   7. emit done event
 *
 * The caller receives events through an `emit` callback so it can write
 * SSE frames, buffer responses, or route to other transports (Telegram etc.)
 * without this service knowing about HTTP.
 *
 * Dependencies verified against actual source files before writing:
 *   PrismaService                     — database/prisma/prisma.service.ts
 *   createLlmProvider()               — autopilot/llm.ts
 *   parseIntent(msg, llm, tenantCtx?) — agents/intent_parser.ts
 *   analyzeOnboarding(model, history, msg) — agents/onboarding.ts
 *   buildOnboardingReplyPrompt(topic, history) — agents/onboarding.ts
 *   createProposal(db, tenantId, draft, msgId?) — chat/proposals.ts
 *   getStructuredProfile(db, tenantId)          — memory/index.ts
 *   streamText                        — ai-v5
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Organization,
  User,
  ApChatMessageRole,
  ApChatMessageSource,
} from '@prisma/client';
import { streamText } from 'ai-v5';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { createLlmProvider } from '../llm';
import { parseIntent } from '../agents/intent_parser';
import {
  analyzeOnboarding,
  buildOnboardingReplyPrompt,
  type OnboardingTurn,
} from '../agents/onboarding';
import {
  createProposal,
  confirm,
  cancel,
  type ConfirmResult,
} from './proposals';
import { getStructuredProfile } from '../memory';
import {
  DirectActionHandler,
  type ChatDraftPreviewEvent,
} from './direct_action_handler';
import type {
  ChatScheduledListEvent,
  ChatAnalyticsCardEvent,
  ChatConfirmEvent,
  ChatActionResultEvent,
} from '../orchestrator';

// ---------------------------------------------------------------------------
// Stream event types
// ---------------------------------------------------------------------------

/** A text chunk streamed from the LLM for non-proposal responses. */
export type ChatTextEvent = { type: 'text'; chunk: string };

/**
 * Emitted when the intent is config_change_request.
 * The frontend renders a card-select confirm UX from this payload.
 */
export type ChatProposalEvent = {
  type: 'proposal';
  proposalId: string;
  rationale: string;
  targetEntity: string;
  changes: Record<string, unknown>;
};

/** Final event — always emitted on success. */
export type ChatDoneEvent = {
  type: 'done';
  assistantMessageId: string;
};

/** Emitted when an unrecoverable error occurs. */
export type ChatErrorEvent = { type: 'error'; message: string };

/** Transient processing status shown while content is still loading. */
export type ChatStatusEvent = { type: 'status'; message: string };

export type ChatStreamEvent =
  | ChatTextEvent
  | ChatProposalEvent
  | ChatDraftPreviewEvent
  | ChatStatusEvent
  | ChatDoneEvent
  | ChatErrorEvent
  | ChatScheduledListEvent
  | ChatAnalyticsCardEvent
  | ChatConfirmEvent
  | ChatActionResultEvent;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ChatIngressInput {
  content: string;
  source?: 'web' | 'telegram' | 'api';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AutopilotChatService {
  private readonly logger = new Logger(AutopilotChatService.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _directAction: DirectActionHandler,
  ) {}

  /**
   * Process one user chat message end-to-end.
   *
   * @param org   - The authenticated tenant (from req.org).
   * @param user  - The authenticated user (from req.user).
   * @param input - The incoming message body.
   * @param emit  - Callback invoked for each SSE-style event.
   */
  async handleChat(
    org: Organization,
    user: User,
    input: ChatIngressInput,
    emit: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    const sourceEnum = this._mapSource(input.source ?? 'web');

    // Step 1: Persist user message.
    const userMsg = await this._prisma.apChatMessage.create({
      data: {
        organizationId: org.id,
        role: ApChatMessageRole.USER,
        content: input.content,
        source: sourceEnum,
        metadata: { userId: user.id },
      },
    });

    // Step 2: Acquire LLM.
    const llm = createLlmProvider();
    if (!llm) {
      const msg =
        'No LLM provider configured — set AP_OPENAI_API_KEY, AP_ANTHROPIC_API_KEY, or AP_GOOGLE_API_KEY.';
      this.logger.warn(msg);
      emit({ type: 'error', message: msg });
      return;
    }

    // Step 3: Load tenant context (profile + opt-out status) and detect first-run.
    let isFirstRun = false;
    let tenantCtx:
      | { niche?: string; goals?: unknown; strategyOptout?: boolean }
      | undefined;
    try {
      const [profile, optoutRow] = await Promise.all([
        getStructuredProfile(this._prisma, org.id),
        this._prisma.apTenantStrategyOptout.findUnique({
          where: { organizationId: org.id },
          select: { id: true },
        }),
      ]);
      if (profile.businessProfile) {
        tenantCtx = {
          niche: profile.businessProfile.niche || undefined,
          goals: profile.businessProfile.goals,
          strategyOptout: optoutRow !== null,
        };
      } else {
        isFirstRun = true;
      }
    } catch (err) {
      this.logger.warn('Could not load tenant profile for intent parser', err);
    }

    // Step 4+5: Route based on first-run (onboarding) vs normal flow.
    let assistantContent: string;

    if (isFirstRun) {
      // --- Onboarding path (slice 1.12) ---
      const history = await this._loadOnboardingHistory(org.id);
      let decision: Awaited<ReturnType<typeof analyzeOnboarding>>;
      try {
        decision = await analyzeOnboarding(
          llm.model,
          history,
          input.content,
        );
      } catch (err) {
        const msg = `Onboarding analysis failed: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error(msg, err);
        emit({ type: 'error', message: msg });
        return;
      }

      if (decision.action === 'propose') {
        // Enough info gathered — create a proposal for business_profile.
        const proposalId = await createProposal(
          this._prisma,
          org.id,
          decision.draft,
          userMsg.id,
        );

        assistantContent = decision.draft.rationale;
        emit({
          type: 'proposal',
          proposalId,
          rationale: decision.draft.rationale,
          targetEntity: decision.draft.targetEntity,
          changes: decision.draft.changes,
        });
      } else {
        // Need more info — stream a follow-up question.
        let fullText = '';
        try {
          const messages = [
            ...history
              .filter((t) => t.role === 'user' || t.role === 'assistant')
              .map((t) => ({
                role: t.role as 'user' | 'assistant',
                content: t.content,
              })),
            { role: 'user' as const, content: input.content },
          ];

          const { textStream } = streamText({
            model: llm.model,
            system: buildOnboardingReplyPrompt(decision.topic, history),
            messages,
          });

          for await (const chunk of textStream) {
            fullText += chunk;
            emit({ type: 'text', chunk });
          }
        } catch (err) {
          const msg = `Text generation failed: ${err instanceof Error ? err.message : String(err)}`;
          this.logger.error(msg, err);
          emit({ type: 'error', message: msg });
          return;
        }
        assistantContent = fullText;
      }
    } else {
      // --- Normal flow ---

      emit({ type: 'status', message: 'Thinking…' });

      // Always parse intent first — the result is needed to decide whether
      // to continue a pending action or abort it.
      // parseIntent never throws; on schema failure it returns { intent: 'unclear' }.
      const recentForIntent = await this._loadRecentMessages(org.id, 6);
      const intentResult = await parseIntent(input.content, llm, tenantCtx, recentForIntent);

      // Check for an in-progress direct action.
      const pendingAction = await this._prisma.apPendingAction.findUnique({
        where: { organizationId: org.id },
      });

      const hasPending = !!(pendingAction && pendingAction.expiresAt > new Date());

      // Decide whether to abort the pending action.
      // Abort when:  (a) user explicitly cancels, or (b) user starts a brand-new post request.
      const wantsAbort = hasPending && (
        this._isCancellationMessage(input.content) ||
        intentResult.intent === 'direct_action'
      );

      if (wantsAbort) {
        await this._directAction.cancelAction(org.id);
      }

      if (hasPending && !wantsAbort) {
        // User is answering a follow-up question — continue the pending flow.
        try {
          assistantContent = await this._directAction.continuePending(
            org,
            pendingAction!.id,
            pendingAction!.waitingFor,
            pendingAction!.collectedData,
            input.content,
            llm,
            emit,
          );
        } catch (err) {
          const msg = `Direct action failed: ${err instanceof Error ? err.message : String(err)}`;
          this.logger.error(msg, err);
          emit({ type: 'error', message: msg });
          return;
        }
      } else {
        // Step 5: Generate response based on (possibly fresh) intent.
        if (intentResult.intent === 'direct_action') {
          // 5a — Direct action (post creation) flow.
          try {
            assistantContent = await this._directAction.startFlow(
              org,
              user,
              intentResult.directAction ?? {},
              llm,
              emit,
            );
          } catch (err) {
            const msg = `Direct action failed: ${err instanceof Error ? err.message : String(err)}`;
            this.logger.error(msg, err);
            emit({ type: 'error', message: msg });
            return;
          }
        } else if (wantsAbort) {
          // User cancelled a pending action with no new command — confirm and idle.
          assistantContent = "Cancelled.";
          emit({ type: 'text', chunk: assistantContent });
        } else if (intentResult.intent === 'config_change_request' && intentResult.draft) {
          // 5b — Proposal path.
          const draft = intentResult.draft;
          const proposalId = await createProposal(
            this._prisma,
            org.id,
            {
              targetEntity: draft.targetEntity,
              targetId: draft.targetId,
              changes: draft.changes,
              rationale: draft.rationale,
            },
            userMsg.id,
          );

          assistantContent = draft.rationale;
          emit({
            type: 'proposal',
            proposalId,
            rationale: draft.rationale,
            targetEntity: draft.targetEntity,
            changes: draft.changes,
          });
        } else {
          // 5c — Streamed text response.
          let fullText = '';
          try {
            // Load recent history (includes the just-persisted user message at the end).
            const recentMessages = await this._loadRecentMessages(org.id);
            const { textStream } = streamText({
              model: llm.model,
              messages: recentMessages,
              system: this._buildReplyPrompt(intentResult.intent, tenantCtx),
            });

            for await (const chunk of textStream) {
              fullText += chunk;
              emit({ type: 'text', chunk });
            }
          } catch (err) {
            const msg = `Text generation failed: ${err instanceof Error ? err.message : String(err)}`;
            this.logger.error(msg, err);
            emit({ type: 'error', message: msg });
            return;
          }

          assistantContent = fullText;
        }
      }
    }

    // Step 6: Persist assistant message — skip empty-content rows (draft previews
    // emit a card event; there is no text to store in history).
    if (!assistantContent) {
      emit({ type: 'done', assistantMessageId: '' });
      return;
    }
    const assistantMsg = await this._prisma.apChatMessage.create({
      data: {
        organizationId: org.id,
        role: ApChatMessageRole.ASSISTANT,
        content: assistantContent,
        source: sourceEnum,
      },
    });

    // Step 7: Signal completion.
    emit({ type: 'done', assistantMessageId: assistantMsg.id });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the message is an explicit cancellation or reset command.
   * Keyword-based — no LLM call needed.
   */
  private _isCancellationMessage(message: string): boolean {
    return /\b(cancel|abort|stop|forget it|nevermind|never mind|start over|reset|quit|exit|drop it|discard|nope|no thanks)\b/i.test(
      message,
    );
  }

  private _mapSource(source: 'web' | 'telegram' | 'api'): ApChatMessageSource {
    switch (source) {
      case 'telegram':
        return ApChatMessageSource.TELEGRAM;
      case 'api':
        return ApChatMessageSource.API;
      default:
        return ApChatMessageSource.WEB;
    }
  }

  private _buildReplyPrompt(
    intent: string,
    tenantCtx?: { niche?: string; goals?: unknown; strategyOptout?: boolean },
  ): string {
    const lines = [
      'You are a sharp, experienced social media manager — direct, no fluff.',
      'Tone: confident and brief. No filler phrases like "Great question!", "Certainly!", "Of course!", "I\'d be happy to", or "What else can I help you with?".',
      'Answer the question. If you need to ask something, ask it in one short sentence.',
    ];
    if (tenantCtx?.niche) {
      lines.push(`Business niche: ${tenantCtx.niche}.`);
    }
    if (tenantCtx?.strategyOptout !== undefined) {
      const status = tenantCtx.strategyOptout ? 'opted out' : 'opted in';
      lines.push(`Data sharing: ${status} of contributing anonymized strategy patterns.`);
    }
    lines.push(`Intent: ${intent}.`);
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Recent messages for LLM context
  // ---------------------------------------------------------------------------

  /**
   * Load the most recent USER/ASSISTANT messages for a tenant, oldest-first,
   * suitable for passing as the `messages` array to streamText.
   */
  private async _loadRecentMessages(
    tenantId: string,
    limit = 20,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const rows = await this._prisma.apChatMessage.findMany({
      where: {
        organizationId: tenantId,
        role: { in: [ApChatMessageRole.USER, ApChatMessageRole.ASSISTANT] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });
    return rows.reverse().map((r) => ({
      role: r.role === ApChatMessageRole.USER ? 'user' : 'assistant',
      content: r.content,
    }));
  }

  // ---------------------------------------------------------------------------
  // Chat history loader
  // ---------------------------------------------------------------------------

  /**
   * Return the most recent chat messages for a tenant, oldest-first.
   * Only USER and ASSISTANT roles are included (proposals are ephemeral).
   */
  async getHistory(
    tenantId: string,
    limit = 100,
  ): Promise<{ messages: { id: string; role: string; content: string; createdAt: string }[] }> {
    const rows = await this._prisma.apChatMessage.findMany({
      where: {
        organizationId: tenantId,
        role: { in: [ApChatMessageRole.USER, ApChatMessageRole.ASSISTANT] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return {
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role === ApChatMessageRole.USER ? 'user' : 'assistant',
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Strategy opt-out status (slice 4.6)
  // ---------------------------------------------------------------------------

  /**
   * Return the tenant's current strategy-pattern contribution opt-out status.
   * Row present = opted out; row absent = opted in (the default).
   */
  async getStrategyOptoutStatus(
    tenantId: string,
  ): Promise<{ optedOut: boolean }> {
    const row = await this._prisma.apTenantStrategyOptout.findUnique({
      where: { organizationId: tenantId },
      select: { id: true },
    });
    return { optedOut: row !== null };
  }

  // ---------------------------------------------------------------------------
  // Onboarding history loader (slice 1.12)
  // ---------------------------------------------------------------------------

  /**
   * Load recent chat messages for the tenant to give the onboarding agent
   * conversational context.  Returns oldest-first.
   */
  private async _loadOnboardingHistory(
    tenantId: string,
    limit = 20,
  ): Promise<OnboardingTurn[]> {
    const rows = await this._prisma.apChatMessage.findMany({
      where: { organizationId: tenantId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { role: true, content: true },
    });

    return rows.map((r) => ({
      role:
        r.role === ApChatMessageRole.USER
          ? ('user' as const)
          : r.role === ApChatMessageRole.ASSISTANT
            ? ('assistant' as const)
            : ('system' as const),
      content: r.content,
    }));
  }

  // ---------------------------------------------------------------------------
  // Proposal confirm / cancel (slice 1.11)
  // ---------------------------------------------------------------------------

  /**
   * Confirm a proposal, guarded by tenantId to prevent cross-tenant tampering.
   */
  async confirmProposal(
    proposalId: string,
    tenantId: string,
  ): Promise<ConfirmResult> {
    const row = await this._prisma.apConfigChangeProposal.findFirst({
      where: { id: proposalId, organizationId: tenantId },
      select: { id: true },
    });
    if (!row) {
      return { ok: false, reason: 'not_found', message: 'Proposal not found.' };
    }
    return confirm(this._prisma, proposalId);
  }

  /**
   * Cancel a proposal, guarded by tenantId.  Silently ignores unknown ids.
   */
  async cancelProposal(
    proposalId: string,
    tenantId: string,
  ): Promise<void> {
    const row = await this._prisma.apConfigChangeProposal.findFirst({
      where: { id: proposalId, organizationId: tenantId },
      select: { id: true },
    });
    if (!row) return;
    await cancel(this._prisma, proposalId);
  }

  // ---------------------------------------------------------------------------
  // Direct-action post confirm / cancel
  // ---------------------------------------------------------------------------

  async confirmPost(
    pendingActionId: string,
    tenantId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const result = await this._directAction.confirmApproval(tenantId, pendingActionId);
    if (result.ok) {
      await this._prisma.apChatMessage.create({
        data: {
          organizationId: tenantId,
          role: ApChatMessageRole.ASSISTANT,
          content: result.message,
          source: ApChatMessageSource.WEB,
        },
      });
    }
    return result;
  }

  async cancelPost(tenantId: string): Promise<void> {
    await this._directAction.cancelAction(tenantId);
    await this._prisma.apChatMessage.create({
      data: {
        organizationId: tenantId,
        role: ApChatMessageRole.ASSISTANT,
        content: 'Cancelled.',
        source: ApChatMessageSource.WEB,
      },
    });
  }
}
