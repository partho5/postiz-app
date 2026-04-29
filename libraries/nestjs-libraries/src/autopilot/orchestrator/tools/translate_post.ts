/**
 * `translate_post` tool — slice E.5
 *
 * Translates a social media post into the requested target language via the
 * LLM, preserving platform conventions (hashtags, emoji, length).
 * Pure read — returns the translated text, no stack push.
 *
 * Use when the user asks "translate this to Spanish", "give me the French
 * version of this post", "localise for Portuguese audience".
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  content: z.string().min(1).describe('The original post text to translate.'),
  targetLanguage: z
    .string()
    .min(1)
    .describe('Target language name or BCP-47 code (e.g. "Spanish", "fr", "pt-BR").'),
  sourcePlatform: z
    .string()
    .optional()
    .describe(
      'Platform slug (e.g. "twitter") to help preserve platform-specific conventions (hashtags, length). Omit when unknown.',
    ),
});

export type TranslatePostInput = z.infer<typeof inputSchema>;

export interface TranslatePostOutput {
  targetLanguage: string;
  translatedContent: string;
}

export function createTranslatePostTool(): OrchestratorTool<
  TranslatePostInput,
  TranslatePostOutput
> {
  return {
    name: 'translate_post',
    description:
      'Translate a post into a target language while preserving platform conventions (hashtags, emojis, length). Use for "translate to Spanish", "French version of this post". Returns translated text — does NOT push to the draft queue.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const platformHint = input.sourcePlatform
        ? ` This is a ${input.sourcePlatform} post — preserve its style, hashtags, and length constraints.`
        : '';

      const translatedContent = await ctx.llm.complete(
        [
          `Translate the following social media post into ${input.targetLanguage}.${platformHint}`,
          `Keep hashtags if present (translate or localise them as appropriate).`,
          `Preserve the tone, structure, and any emojis.`,
          `Return only the translated post text, nothing else.`,
          ``,
          `Original:`,
          input.content,
        ].join('\n'),
        { maxOutputTokens: 1024 },
      );

      const observation =
        `Translated to ${input.targetLanguage}:\n\n${translatedContent.trim()}`;

      ctx.logger.info(
        `translate_post: org=${ctx.org.id} targetLanguage=${input.targetLanguage}`,
      );

      return {
        observation,
        data: { targetLanguage: input.targetLanguage, translatedContent: translatedContent.trim() },
      };
    },
  };
}
