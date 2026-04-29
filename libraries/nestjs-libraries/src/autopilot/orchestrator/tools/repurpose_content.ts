/**
 * `repurpose_content` tool — slice E.7
 *
 * Takes existing content and rewrites it into one or more alternative formats
 * (thread, carousel, short, longform). When `pushToDraft=true`, each variant
 * is pushed as a PENDING post candidate and an `action_result` event is emitted.
 * Otherwise pure read — returns repurposed variants for review.
 *
 * Use when the user says "repurpose this post as a thread", "turn this into a
 * carousel", "make a short version of my article", "adapt this content for Twitter".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile } from '../../memory';
import { push } from '../../stack';
import type { OrchestratorTool } from '../types';

const FORMAT_VALUES = ['thread', 'carousel', 'short', 'longform'] as const;
type RepurposeFormat = (typeof FORMAT_VALUES)[number];

const inputSchema = z.object({
  content: z.string().min(1).describe('The original post content to repurpose.'),
  targetFormats: z
    .array(z.enum(FORMAT_VALUES))
    .min(1)
    .describe('One or more formats to repurpose into: "thread", "carousel", "short", "longform".'),
  platform: z
    .string()
    .optional()
    .describe('Target platform for repurposed content (e.g. "twitter", "linkedin"). Omit for generic.'),
  pushToDraft: z
    .boolean()
    .optional()
    .describe('If true, push each repurposed variant as a PENDING draft. Defaults to false (preview only).'),
});

export type RepurposeContentInput = z.infer<typeof inputSchema>;

export interface RepurposedVariant {
  format: RepurposeFormat;
  content: string;
  pushed?: boolean;
}

export interface RepurposeContentOutput {
  originalLength: number;
  variants: RepurposedVariant[];
  pushedCount: number;
}

const variantSchema = z.object({
  format: z.enum(FORMAT_VALUES),
  content: z.string().describe('The repurposed content in the requested format.'),
});

const outputSchema = z.object({
  variants: z.array(variantSchema),
});

function formatPromptHint(fmt: RepurposeFormat): string {
  switch (fmt) {
    case 'thread':
      return 'a Twitter/X thread with 3–6 numbered tweets, each under 280 chars, separated by "---"';
    case 'carousel':
      return 'a LinkedIn carousel caption (hook line + 4–6 bullet slides), each slide separated by "---"';
    case 'short':
      return 'a concise single post under 280 characters capturing the core message';
    case 'longform':
      return 'a long-form LinkedIn article (400–800 words) with a title, intro, body paragraphs, and conclusion';
  }
}

export function createRepurposeContentTool(): OrchestratorTool<
  RepurposeContentInput,
  RepurposeContentOutput
> {
  return {
    name: 'repurpose_content',
    description:
      'Repurpose existing content into alternative formats: thread, carousel, short post, or longform. Use for "repurpose this as a thread", "make a carousel from this", "adapt this content for Twitter". Set pushToDraft=true to save variants as drafts.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const platform = input.platform ?? 'general';
      const pushToDraft = input.pushToDraft ?? false;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );
      const bp = profile?.businessProfile;
      const voiceHint = bp?.brandVoiceShort ? `Brand voice: ${bp.brandVoiceShort}.` : '';

      const formatDescriptions = input.targetFormats
        .map((f) => `- ${f}: ${formatPromptHint(f)}`)
        .join('\n');

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are a content repurposing specialist. Rewrite the given content into the requested formats.`,
          voiceHint,
          `Target platform: ${platform}.`,
          'Preserve the core message and key insights. Adapt style and length for each format.',
        ]
          .filter(Boolean)
          .join('\n'),
        prompt: [
          `Original content:\n${input.content}`,
          `\nRepurpose into these formats:\n${formatDescriptions}`,
          `Return exactly ${input.targetFormats.length} variant(s), one per requested format.`,
        ].join('\n'),
      });

      const variants: RepurposedVariant[] = [];
      let pushedCount = 0;

      for (const v of object.variants.slice(0, input.targetFormats.length)) {
        let pushed = false;
        if (pushToDraft) {
          await push(
            ctx.db as unknown as PrismaClient,
            ctx.org.id,
            platform === 'general' ? 'twitter' : platform,
            v.content,
            { metadata: { format: v.format, repurposedFrom: input.content.slice(0, 100) } },
          );
          pushedCount++;
          pushed = true;
        }
        variants.push({ format: v.format, content: v.content, pushed });
      }

      const lines: string[] = [
        `Repurposed content (${variants.length} variant(s)):`,
        '',
      ];
      for (const v of variants) {
        lines.push(`## ${v.format.toUpperCase()}${v.pushed ? ' ✓ saved as draft' : ''}`);
        lines.push(v.content);
        lines.push('');
      }
      if (pushToDraft && pushedCount > 0) {
        lines.push(`${pushedCount} variant(s) saved to draft queue.`);
      }

      if (pushToDraft && pushedCount > 0) {
        ctx.emit({
          type: 'action_result',
          action: 'repurpose_content',
          ok: true,
          message: `${pushedCount} repurposed variant(s) saved as drafts.`,
        });
      }

      ctx.logger.info(
        `repurpose_content: org=${ctx.org.id} formats=${input.targetFormats.join(',')} pushed=${pushedCount}`,
      );

      return {
        observation: lines.join('\n'),
        data: { originalLength: input.content.length, variants, pushedCount },
        emitted: pushToDraft && pushedCount > 0,
      };
    },
  };
}
