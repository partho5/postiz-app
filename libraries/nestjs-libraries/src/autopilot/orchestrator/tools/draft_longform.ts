/**
 * `draft_longform` tool — slice E.5
 *
 * Generates a long-form post (LinkedIn article, Facebook note) via the LLM and
 * pushes it to the draft queue. Emits `action_result`.
 *
 * Use when the user asks "write a LinkedIn article about X", "draft a long post
 * on Y", "create a detailed Facebook post about Z".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { push } from '../../stack';
import { getStructuredProfile } from '../../memory';
import { PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC } from '../../agents/copywriter';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  topic: z.string().min(1).describe('The topic or title for the long-form post.'),
  platform: z
    .string()
    .optional()
    .describe('Platform slug (e.g. "linkedin", "facebook"). Defaults to "linkedin".'),
  wordCount: z
    .number()
    .int()
    .min(200)
    .max(3000)
    .optional()
    .describe('Approximate target word count (200–3000). Defaults to 800.'),
  guidelines: z
    .string()
    .optional()
    .describe('Additional style or content guidelines.'),
});

export type DraftLongformInput = z.infer<typeof inputSchema>;

export interface DraftLongformOutput {
  candidateId: string;
  platform: string;
  wordCount: number;
}

const outputSchema = z.object({
  content: z.string().describe('The full long-form post body.'),
});

export function createDraftLongformTool(): OrchestratorTool<
  DraftLongformInput,
  DraftLongformOutput
> {
  return {
    name: 'draft_longform',
    description:
      'Generate a long-form post (LinkedIn article, Facebook note, detailed write-up) and save it to the draft queue. Use for "write a LinkedIn article about X", "draft a long post on Y". Emits action_result.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const platform = input.platform ?? 'linkedin';
      const wordCount = input.wordCount ?? 800;
      const spec = PLATFORM_SPECS[platform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );

      const bp = profile?.businessProfile;
      const voiceBlock = bp
        ? `Brand voice: ${bp.brandVoiceShort ?? 'professional and engaging'}\nNiche: ${bp.niche ?? 'general'}`
        : 'Use a professional, engaging tone.';

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are a content writer creating a long-form ${spec.displayName} post.`,
          `Platform conventions: ${spec.conventions}`,
          spec.maxChars
            ? `Max characters: ${spec.maxChars}. Keep the full post within this limit.`
            : `Target approximately ${wordCount} words.`,
          voiceBlock,
          input.guidelines ? `Additional guidelines: ${input.guidelines}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        prompt: `Write a detailed, engaging long-form post about: ${input.topic}`,
      });

      const candidate = await push(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
        platform,
        object.content,
        {
          source: 'chat_agent',
          priority: 10,
          metadata: { topic: input.topic, format: 'longform' },
        },
      );

      const actualWordCount = object.content.split(/\s+/).length;

      ctx.emit({
        type: 'action_result',
        action: 'draft_longform',
        ok: true,
        message: `Long-form draft saved to ${platform} queue (id: ${candidate.id}, ~${actualWordCount} words).`,
      });

      ctx.logger.info(
        `draft_longform: org=${ctx.org.id} platform=${platform} words=${actualWordCount} id=${candidate.id}`,
      );

      return {
        observation: `Long-form ${platform} post drafted (~${actualWordCount} words) and saved to queue (id: ${candidate.id}).\n\nPreview:\n${object.content.slice(0, 300)}${object.content.length > 300 ? '…' : ''}`,
        data: { candidateId: candidate.id, platform, wordCount: actualWordCount },
        emitted: true,
      };
    },
  };
}
