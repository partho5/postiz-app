/**
 * `schedule_post` tool — unified array-based post scheduling
 *
 * Accepts one or many topics as an array. A single post is just topics:[…]
 * with one element. A series of 7 posts is topics:[…] with seven elements.
 * No separate `create_post_series` tool exists — this handles all counts.
 *
 * Timing:
 *   - `startTime`: natural-language phrase for the first (or only) post.
 *   - `immediate`: true when user says "now"/"asap" — skip startTime.
 *   - `intervalMinutes`: gap between posts in a series (default 60).
 *
 * Delegates entirely to DirectActionHandler.startFlow which runs the
 * state machine (platforms → timing → approval draft preview).
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import type { DirectActionHandler } from '../../chat/direct_action_handler';
import type { DirectActionData } from '../../agents/intent_parser';

const inputSchema = z.object({
  topics: z
    .array(z.string())
    .min(1)
    .max(20)
    .describe(
      'Array of topics — always an array even for a single post (e.g. ["the topic"]). For a series: ["word1","word2","word3"]. Each topic generates one post per platform.',
    ),
  platforms: z
    .array(z.string())
    .optional()
    .describe(
      'Platform slugs to post to (e.g. ["linkedin","facebook"]). Omit if the user did not specify — the state machine will ask.',
    ),
  startTime: z
    .string()
    .optional()
    .describe(
      'Natural-language time for the first (or only) post (e.g. "next hour", "tomorrow 9am", "Friday 3pm"). Pass verbatim — the state machine parses it. Omit if not specified.',
    ),
  immediate: z
    .boolean()
    .optional()
    .describe(
      'Set true ONLY when the user explicitly said "now", "right now", "asap", "immediately". Never default to true.',
    ),
  intervalMinutes: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Minutes between consecutive posts when scheduling a series (e.g. 60 for "every hour", 1440 for "every day"). Omit for a single post.',
    ),
  content: z
    .string()
    .optional()
    .describe(
      'Verbatim post text if the user typed the exact wording. Leave undefined when only a topic/subject was given.',
    ),
  wantsImage: z
    .boolean()
    .optional()
    .describe('True only if the user explicitly asked for an AI-generated image.'),
  perPostTimes: z
    .array(z.string())
    .optional()
    .describe(
      'Per-topic schedule times — same length as topics. Use when the user gives each post a DIFFERENT time (e.g. "post topic1 at 11am, topic2 at 2pm, topic3 at 5pm"). Each element is a natural-language time phrase. If all posts share one start time + interval, omit this and use startTime + intervalMinutes instead.',
    ),
}).refine(
  (d) => !d.perPostTimes || d.perPostTimes.length === d.topics.length,
  { message: 'perPostTimes must be the same length as topics' },
);

export type SchedulePostInput = z.infer<typeof inputSchema>;

export interface SchedulePostOutput {
  stage: 'preview_emitted' | 'follow_up_question' | 'noop';
}

export interface SchedulePostDeps {
  directAction: Pick<DirectActionHandler, 'startFlow'>;
}

export function createSchedulePostTool(
  deps: SchedulePostDeps,
): OrchestratorTool<SchedulePostInput, SchedulePostOutput> {
  return {
    name: 'schedule_post',
    description:
      'Create and schedule one or more social media posts. Always pass topics as an array — single post: topics:["the topic"]; series of 7: topics:["w1","w2",...,"w7"]. For a series also pass intervalMinutes (e.g. 60 for hourly). Safe to call on follow-up turns — the state machine merges new info with what was already collected.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const directAction: DirectActionData = {
        topics: input.topics,
        content: input.content,
        platforms: input.platforms,
        startTime: input.startTime,
        immediate: input.immediate,
        intervalMinutes: input.intervalMinutes,
        wantsImage: input.wantsImage,
        perPostTimes: input.perPostTimes,
      };

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
          directAction,
          ctx.llm,
          wrappedEmit,
          ctx.timezone,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(`schedule_post: startFlow failed — ${msg}`);
        return {
          observation: `Could not schedule the post: ${msg}`,
          data: { stage: 'noop' as const },
        };
      }

      const stage: SchedulePostOutput['stage'] = previewEmitted
        ? 'preview_emitted'
        : textEmitted
          ? 'follow_up_question'
          : 'noop';

      const observation =
        stage === 'preview_emitted'
          ? `Drafted ${input.topics.length} post${input.topics.length === 1 ? '' : 's'} and emitted a draft preview. Wait for the user to confirm or cancel — do NOT call any other tool now.`
          : stage === 'follow_up_question'
            ? 'The state machine asked the user a follow-up question. Stop and wait for their reply.'
            : 'No-op — nothing was emitted.';

      return {
        observation,
        data: { stage },
        emitted: previewEmitted || textEmitted,
      };
    },
  };
}
