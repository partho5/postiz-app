/**
 * `apply_brand_voice` tool — slice E.5
 *
 * Rewrites a draft post to match the tenant's stored brand voice (tone,
 * vocabulary, anti-patterns) and target platform conventions. Pure read —
 * returns the rewritten text, does not push to the draft stack.
 *
 * Use when the user says "make this sound more like us", "apply our brand
 * voice to this", "rewrite this post in our style".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile } from '../../memory';
import { PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC } from '../../agents/copywriter';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  content: z.string().min(1).describe('The draft post text to rewrite.'),
  platform: z
    .string()
    .describe('Target platform slug (e.g. "linkedin", "twitter", "instagram").'),
  guidelines: z
    .string()
    .optional()
    .describe('Additional constraints or notes to apply during rewriting.'),
});

export type ApplyBrandVoiceInput = z.infer<typeof inputSchema>;

export interface ApplyBrandVoiceOutput {
  platform: string;
  rewrittenContent: string;
  characterCount: number;
}

const outputSchema = z.object({
  rewrittenContent: z
    .string()
    .describe('The post text rewritten to match the brand voice and platform conventions.'),
});

export function createApplyBrandVoiceTool(): OrchestratorTool<
  ApplyBrandVoiceInput,
  ApplyBrandVoiceOutput
> {
  return {
    name: 'apply_brand_voice',
    description:
      'Rewrite a draft post to match the account\'s stored brand voice and platform conventions. Use when the user says "make this sound more like us", "apply our brand voice", "rewrite in our style". Returns rewritten text — does NOT push to the draft queue.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );

      const spec = PLATFORM_SPECS[input.platform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

      const bp = profile?.businessProfile;
      const voiceBlock = bp
        ? [
            `Brand voice (short): ${bp.brandVoiceShort ?? 'not set'}`,
            `Brand voice (extended): ${bp.brandVoiceExtended ?? 'not set'}`,
            Array.isArray(bp.antiPatterns) && (bp.antiPatterns as string[]).length
              ? `Anti-patterns to AVOID: ${(bp.antiPatterns as string[]).join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'No brand profile configured — use a professional, engaging tone.';

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are a brand editor rewriting social media posts.`,
          `Platform: ${spec.displayName}`,
          `Platform conventions: ${spec.conventions}`,
          spec.maxChars ? `Max characters: ${spec.maxChars}` : '',
          ``,
          `Brand guidelines:`,
          voiceBlock,
          input.guidelines ? `\nAdditional instructions: ${input.guidelines}` : '',
        ]
          .filter((l) => l !== undefined)
          .join('\n'),
        prompt: `Rewrite the following post to match the brand voice and platform conventions.\n\nOriginal:\n${input.content}`,
      });

      const rewritten = object.rewrittenContent;
      const observation = `Brand-voice rewrite for ${input.platform}:\n\n${rewritten}`;

      ctx.logger.info(
        `apply_brand_voice: org=${ctx.org.id} platform=${input.platform} chars=${rewritten.length}`,
      );

      return {
        observation,
        data: {
          platform: input.platform,
          rewrittenContent: rewritten,
          characterCount: rewritten.length,
        },
      };
    },
  };
}
