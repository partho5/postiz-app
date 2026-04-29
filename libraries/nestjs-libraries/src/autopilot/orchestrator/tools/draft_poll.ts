/**
 * `draft_poll` tool — slice E.5
 *
 * Formats a user-supplied poll question and options as an `ApPostCandidate`
 * with `metadata.poll`. No LLM call — the user provides the question and
 * choices. Emits `action_result`.
 *
 * Use when the user says "create a poll asking X with options A, B, C",
 * "draft a Twitter poll", "make a LinkedIn poll".
 *
 * Note: actual platform poll publishing depends on each platform's API.
 * The candidate is stored in the draft queue; publishing a poll requires
 * platform-specific support in Postiz.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { push } from '../../stack';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  question: z.string().min(1).describe('The poll question.'),
  options: z
    .array(z.string().min(1))
    .min(2)
    .max(4)
    .describe('Poll answer options (2–4 items).'),
  platform: z
    .string()
    .describe('Platform slug for this poll (e.g. "twitter", "linkedin").'),
});

export type DraftPollInput = z.infer<typeof inputSchema>;

export interface DraftPollOutput {
  candidateId: string;
  platform: string;
  question: string;
  options: string[];
}

export function createDraftPollTool(): OrchestratorTool<DraftPollInput, DraftPollOutput> {
  return {
    name: 'draft_poll',
    description:
      'Create a poll draft in the post queue. Provide the question and 2–4 answer options. Use for "draft a poll asking X", "create a Twitter poll", "make a LinkedIn poll". Emits action_result.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      if (input.options.length < 2 || input.options.length > 4) {
        return {
          observation: `Poll requires 2–4 options; received ${input.options.length}.`,
          data: { candidateId: '', platform: input.platform, question: input.question, options: input.options },
        };
      }

      const content = [
        `📊 ${input.question}`,
        ...input.options.map((o, i) => `${i + 1}. ${o}`),
      ].join('\n');

      const candidate = await push(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
        input.platform,
        content,
        {
          source: 'chat_agent',
          priority: 10,
          metadata: {
            poll: { question: input.question, options: input.options },
            format: 'poll',
          },
        },
      );

      ctx.emit({ type: 'action_result', action: 'draft_poll', ok: true, message: `Poll draft created (${input.platform}) — ID: ${candidate.id}` });

      ctx.logger.info(
        `draft_poll: org=${ctx.org.id} platform=${input.platform} id=${candidate.id}`,
      );

      return {
        observation: `Poll draft saved to ${input.platform} queue (id: ${candidate.id}):\nQ: ${input.question}\nOptions: ${input.options.join(', ')}`,
        data: {
          candidateId: candidate.id,
          platform: input.platform,
          question: input.question,
          options: input.options,
        },
        emitted: true,
      };
    },
  };
}
