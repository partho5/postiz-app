/**
 * AutopilotChatService — slice 1.8 + 1.12 (onboarding) + 1.3.f (orchestrator-only)
 *
 * Handles the full chat ingress lifecycle for one user message:
 *   1. Persist user message  → ap_chat_message (role: USER)
 *   2. Acquire LLM provider  → createLlmProvider()
 *   3. Load tenant context   → getStructuredProfile()
 *   4. Route:
 *      - First-run (no business_profile) → onboarding agent (slice 1.12)
 *      - Normal                          → orchestrator agent (slice 1.3.f)
 *   5. Persist assistant msg → ap_chat_message (role: ASSISTANT)
 *   6. emit done event
 *
 * Slice 1.3.f: `parseIntent` removed from the normal flow entirely. All
 * non-onboarding turns route directly through `runOrchestrator`.  Profile/
 * config changes are handled via `update_business_profile` and
 * `set_strategy_optout` tools (proposal pipeline still fires under the hood).
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
import { CadenceConfigService } from '../stack/cadence-config.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import type {
  ChatScheduledListEvent,
  ChatAnalyticsCardEvent,
  ChatConfirmEvent,
  ChatActionResultEvent,
} from '../orchestrator';
import { runOrchestrator } from '../agents/orchestrator';

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
    private readonly _cadenceConfig: CadenceConfigService,
    private readonly _emailService: EmailService,
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
      // --- Normal flow (slice 1.3.f): all turns route through the orchestrator ---
      emit({ type: 'status', message: 'Thinking…' });

      try {
        // _loadRecentMessages includes the just-persisted user message as the
        // last item (Step 1 wrote it). Strip it so the orchestrator doesn't
        // see the current turn twice in its messages array.
        const recentMessages = await this._loadRecentMessages(org.id, 20);
        const history = recentMessages.slice(0, -1);

        const timezone = org.timezone ?? 'UTC';

        const result = await runOrchestrator(
          {
            org,
            user,
            db: this._prisma,
            llm,
            emit,
            logger: {
              info: (m, ...rest) => this.logger.log(m, ...rest),
              warn: (m, ...rest) => this.logger.warn(m, ...rest),
              error: (m, ...rest) => this.logger.error(m, ...rest),
              debug: (m, ...rest) => this.logger.debug(m, ...rest),
            },
            timezone,
            directAction: this._directAction,
            cadenceConfig: this._cadenceConfig,
            emailService: this._emailService,
          },
          {
            message: input.content,
            history,
            tenantCtx,
          },
        );
        assistantContent = result.text;
      } catch (err) {
        const msg = `Orchestrator failed: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error(msg, err);
        emit({ type: 'error', message: msg });
        return;
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
