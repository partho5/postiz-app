/**
 * `draft_thread` tool — slice E.5
 *
 * Generates a cohesive multi-part thread (Twitter/X, LinkedIn) via the LLM.
 * Each thread part is saved as a separate `ApPostCandidate` row, linked by
 * a shared `metadata.threadId`. Emits `action_result`.
 *
 * Use when the user asks "write a thread about X", "create a 5-tweet thread
 * on Y", "draft a LinkedIn carousel thread".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { push } from '../../stack';
import { getStructuredProfile } from '../../memory';
import { PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC } from '../../agents/copywriter';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  topic: z.string().min(1).describe('Topic or thesis for the thread.'),
  platform: z
    .string()
    .optional()
    .describe('Platform slug (e.g. "twitter", "linkedin"). Defaults to "twitter".'),
  threadLength: z
    .number()
    .int()
    .min(2)
    .max(10)
    .optional()
    .describe('Number of thread parts (2–10). Defaults to 5.'),
  guidelines: z
    .string()
    .optional()
    .describe('Additional style or content instructions.'),
});

export type DraftThreadInput = z.infer<typeof inputSchema>;

export interface DraftThreadOutput {
  threadId: string;
  candidateIds: string[];
  platform: string;
  partCount: number;
}

const outputSchema = z.object({
  parts: z
    .array(z.object({ text: z.string().describe('The full text of this thread part.') }))
    .describe('One object per thread part, in order.'),
});

export function createDraftThreadTool(): OrchestratorTool<DraftThreadInput, DraftThreadOutput> {
  return {
    name: 'draft_thread',
    description:
      'Generate a multi-part thread (Twitter/X or LinkedIn) and save each part as a draft. Use for "write a thread about X", "create a 5-tweet thread", "draft a LinkedIn thread". Each part is saved separately — linked by a shared thread ID. Emits action_result.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const platform = input.platform ?? 'twitter';
      const threadLength = input.threadLength ?? 5;
      const spec = PLATFORM_SPECS[platform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );

      const bp = profile?.businessProfile;
      const voiceBlock = bp
        ? `Brand voice: ${bp.brandVoiceShort ?? 'engaging and authoritative'}`
        : 'Use a professional, engaging tone.';

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are writing a ${threadLength}-part thread for ${spec.displayName}.`,
          `Each part should flow naturally from the previous one.`,
          `Part 1 should hook the reader. Final part should have a strong CTA or conclusion.`,
          spec.maxChars ? `Each part must be under ${spec.maxChars} characters.` : '',
          `Platform conventions: ${spec.conventions}`,
          voiceBlock,
          input.guidelines ? `Additional guidelines: ${input.guidelines}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        prompt: `Write a ${threadLength}-part thread about: ${input.topic}`,
      });

      const parts = object.parts.slice(0, threadLength);
      const threadId = generateId();
      const db = ctx.db as unknown as PrismaClient;

      const candidateIds: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const candidate = await push(db, ctx.org.id, platform, parts[i].text, {
          source: 'chat_agent',
          priority: 10,
          metadata: {
            threadId,
            threadPart: i + 1,
            threadTotal: parts.length,
            topic: input.topic,
            format: 'thread',
          },
        });
        candidateIds.push(candidate.id);
      }

      ctx.emit({
        type: 'action_result',
        action: 'draft_thread',
        ok: true,
        message: `Thread drafted: ${parts.length} parts saved to ${platform} queue (thread ID: ${threadId}).`,
      });

      ctx.logger.info(
        `draft_thread: org=${ctx.org.id} platform=${platform} parts=${parts.length} threadId=${threadId}`,
      );

      return {
        observation: `${parts.length}-part ${platform} thread drafted and saved to queue (thread ID: ${threadId}).\nPart 1: "${parts[0].text.slice(0, 100)}${parts[0].text.length > 100 ? '…' : ''}"`,
        data: { threadId, candidateIds, platform, partCount: parts.length },
        emitted: true,
      };
    },
  };
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
