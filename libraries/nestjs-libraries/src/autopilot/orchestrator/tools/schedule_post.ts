/**
 * `schedule_post` tool — slice 1.3.c (the bug-fix carrier)
 *
 * Single tool the LLM uses to push a post into the queue. It wraps the
 * existing multi-turn `DirectActionHandler` state machine — preserving
 * the draft_preview UX — but replaces its blind classify-and-restart
 * routing with a stateful merge:
 *
 *   - if a pending action exists, this tool MERGES the new fields with
 *     the prior `collectedData` instead of clobbering it. So a follow-up
 *     turn like "after 5 minutes" finds the topic + platforms still
 *     intact and only fills in the timing.
 *   - if no pending action exists, it starts a fresh flow.
 *
 * Time arguments come in as either:
 *   - `when: string` — natural language ("after 5 minutes", "tomorrow 9am",
 *     ISO 8601). Parsed deterministically via `parseTimeExpression`. If
 *     parsing fails we DO NOT default-to-now — we leave timing unset and
 *     let the state machine ask. This is the explicit fix for the
 *     "default to immediately=true" bug in the old `_parseTiming`.
 *   - `immediate: true` — user explicitly said now/asap.
 *
 * `wantsImage`, `topic`, `content`, `platforms`, `count` map straight
 * through to the state machine.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import type { DirectActionHandler } from '../../chat/direct_action_handler';
import type { DirectActionData } from '../../agents/intent_parser';
import { parseTimeExpression } from '../../time/parse';

const inputSchema = z.object({
  topic: z
    .string()
    .optional()
    .describe(
      'Brief paraphrase of what the post is about. Set this when the user describes a subject (e.g. "post about the new feature launch"). Leave undefined if the user provided exact text instead — set `content` for that.',
    ),
  content: z
    .string()
    .optional()
    .describe(
      'Verbatim post text the user wants published as-is. Use this only when the user provides the literal wording.',
    ),
  platforms: z
    .array(z.string())
    .optional()
    .describe(
      'Platform slugs to post to (e.g. ["linkedin","twitter"]). Omit if the user did not specify; the state machine will ask.',
    ),
  when: z
    .string()
    .optional()
    .describe(
      'Natural-language time the user gave for posting (e.g. "after 5 minutes", "tomorrow 9am", "Friday 3pm"). May also be ISO 8601. Omit if not specified.',
    ),
  immediate: z
    .boolean()
    .optional()
    .describe(
      'Set true ONLY when the user explicitly said "now", "right now", "asap", "immediately". Never default to true.',
    ),
  wantsImage: z
    .boolean()
    .optional()
    .describe(
      'True if the user explicitly asked for an AI-generated image. Omit if not mentioned.',
    ),
  countPerPlatform: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Number of post variants to generate per platform (default 1).'),
});

export type SchedulePostInput = z.infer<typeof inputSchema>;

export interface SchedulePostOutput {
  resolvedScheduleAt: string | null;
  publishImmediately: boolean | undefined;
  /** What stage the underlying state machine ended at. */
  stage: 'preview_emitted' | 'follow_up_question' | 'noop';
}

export interface SchedulePostDeps {
  directAction: Pick<DirectActionHandler, 'startFlow'>;
}

/**
 * Build a `schedule_post` tool bound to a particular DirectActionHandler.
 * The factory lets us inject the handler in tests without reaching into
 * Nest's DI container, and keeps `OrchestratorContext` shape lean.
 */
export function createSchedulePostTool(
  deps: SchedulePostDeps,
): OrchestratorTool<SchedulePostInput, SchedulePostOutput> {
  return {
    name: 'schedule_post',
    description:
      'Create or schedule a social media post. Use for any "post X", "schedule a post", "publish about Y" request. Safe to call repeatedly — when a multi-turn flow is already pending, this MERGES the new fields with what was already collected (so a follow-up like "after 5 minutes" only fills in the timing). To start a fresh post while a different one is pending, call `cancel_pending_draft` first.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      // Resolve "when" deterministically. We do NOT default to immediate=true
      // on parse failure — that was the original bug. Leave both unset so
      // the state machine asks the user clearly.
      let resolvedScheduleAt: string | null = null;
      let publishImmediately: boolean | undefined;

      if (input.immediate === true) {
        publishImmediately = true;
      } else if (input.when) {
        const parsed = parseTimeExpression(input.when, {
          now: ctx.now,
          timezone: ctx.timezone,
          forwardOnly: true,
        });
        if (parsed && !parsed.isPast) {
          resolvedScheduleAt = parsed.date.toISOString();
        } else if (parsed && parsed.isPast) {
          ctx.logger.warn(
            `schedule_post: parsed time "${input.when}" is in the past (${parsed.date.toISOString()}); leaving timing unset so the user can re-confirm.`,
          );
        } else {
          ctx.logger.warn(
            `schedule_post: could not parse time expression "${input.when}"; leaving timing unset.`,
          );
        }
      }

      // Merge with any prior pending state so follow-up answers don't lose
      // earlier choices (topic, platforms, etc.).
      const pending = await ctx.db.apPendingAction.findUnique({
        where: { organizationId: ctx.org.id },
      });
      const prior =
        pending && pending.expiresAt > ctx.now
          ? ((pending.collectedData as DirectActionData | null) ?? {})
          : {};

      const merged: DirectActionData = {
        topic: input.topic ?? prior.topic,
        content: input.content ?? prior.content,
        platforms:
          input.platforms && input.platforms.length
            ? input.platforms
            : prior.platforms,
        publishImmediately:
          publishImmediately ?? prior.publishImmediately,
        scheduleAt: resolvedScheduleAt ?? prior.scheduleAt,
        countPerPlatform: input.countPerPlatform ?? prior.countPerPlatform,
        wantsImage:
          input.wantsImage !== undefined ? input.wantsImage : prior.wantsImage,
      };

      // If the new turn provided explicit immediate=true OR a fresh
      // scheduleAt, drop any conflicting earlier value so the state
      // machine sees a single coherent timing answer.
      if (input.immediate === true) {
        merged.scheduleAt = undefined;
      } else if (resolvedScheduleAt) {
        merged.publishImmediately = undefined;
      }

      // Track which side-events the state machine emits so we can report
      // back what stage it stopped at.
      let previewEmitted = false;
      let textEmitted = false;
      const wrappedEmit: typeof ctx.emit = (event) => {
        if (event.type === 'draft_preview') previewEmitted = true;
        if (event.type === 'text') textEmitted = true;
        ctx.emit(event);
      };

      try {
        await deps.directAction.startFlow(
          ctx.org,
          ctx.user,
          merged,
          ctx.llm,
          wrappedEmit,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(`schedule_post: startFlow failed — ${msg}`);
        return {
          observation: `Could not schedule the post: ${msg}`,
          data: {
            resolvedScheduleAt,
            publishImmediately,
            stage: 'noop' as const,
          },
        };
      }

      const stage: SchedulePostOutput['stage'] = previewEmitted
        ? 'preview_emitted'
        : textEmitted
          ? 'follow_up_question'
          : 'noop';

      const observation =
        stage === 'preview_emitted'
          ? `Drafted the post and emitted a draft preview to the user${
              resolvedScheduleAt
                ? ` for ${resolvedScheduleAt}`
                : publishImmediately
                  ? ' to publish immediately'
                  : ''
            }. Wait for the user to confirm or cancel — do not call any other tool now.`
          : stage === 'follow_up_question'
            ? 'The post-creation state machine asked the user a follow-up question (text already streamed). Stop and wait for their reply.'
            : 'No-op — nothing was emitted.';

      return {
        observation,
        data: {
          resolvedScheduleAt,
          publishImmediately,
          stage,
        },
        emitted: previewEmitted || textEmitted,
      };
    },
  };
}
