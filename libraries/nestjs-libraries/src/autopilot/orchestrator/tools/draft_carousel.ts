/**
 * `draft_carousel` tool — slice E.5
 *
 * Generates a multi-slide carousel post (Instagram, LinkedIn) via the LLM.
 * Each slide has a title and body text. Stored as a single `ApPostCandidate`
 * with `contentVariants.slides`. Emits `action_result`.
 *
 * Use when the user asks "create a carousel about X", "make a LinkedIn
 * carousel on Y", "draft a swipe-through post".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { push } from '../../stack';
import { getStructuredProfile } from '../../memory';
import { PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC } from '../../agents/copywriter';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  topic: z.string().min(1).describe('Topic or theme for the carousel.'),
  platform: z
    .string()
    .optional()
    .describe('Platform slug (e.g. "instagram", "linkedin"). Defaults to "instagram".'),
  slideCount: z
    .number()
    .int()
    .min(2)
    .max(10)
    .optional()
    .describe('Number of slides (2–10). Defaults to 5.'),
  guidelines: z
    .string()
    .optional()
    .describe('Additional style or content guidelines.'),
});

export type DraftCarouselInput = z.infer<typeof inputSchema>;

export interface CarouselSlide {
  title: string;
  text: string;
}

export interface DraftCarouselOutput {
  candidateId: string;
  platform: string;
  slideCount: number;
}

const outputSchema = z.object({
  caption: z.string().describe('The cover caption for the carousel post.'),
  slides: z
    .array(
      z.object({
        title: z.string().describe('Short slide heading (5–10 words).'),
        text: z.string().describe('Slide body text (1–3 sentences).'),
      }),
    )
    .describe('One object per slide.'),
});

export function createDraftCarouselTool(): OrchestratorTool<
  DraftCarouselInput,
  DraftCarouselOutput
> {
  return {
    name: 'draft_carousel',
    description:
      'Generate a multi-slide carousel post (Instagram or LinkedIn swipe-through) and save it to the draft queue. Use for "create a carousel about X", "make a LinkedIn carousel", "draft a swipe post". Emits action_result.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const platform = input.platform ?? 'instagram';
      const slideCount = input.slideCount ?? 5;
      const spec = PLATFORM_SPECS[platform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );

      const bp = profile?.businessProfile;
      const voiceBlock = bp
        ? `Brand voice: ${bp.brandVoiceShort ?? 'engaging and educational'}`
        : 'Use a professional, visually oriented tone.';

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are creating a ${slideCount}-slide carousel post for ${spec.displayName}.`,
          `Each slide should be concise and visually oriented.`,
          `Platform conventions: ${spec.conventions}`,
          voiceBlock,
          input.guidelines ? `Guidelines: ${input.guidelines}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        prompt: `Create a ${slideCount}-slide carousel about: ${input.topic}`,
      });

      // Clamp slides to requested count
      const slides = object.slides.slice(0, slideCount);
      const content = object.caption;

      const candidate = await push(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
        platform,
        content,
        {
          source: 'chat_agent',
          priority: 10,
          contentVariants: { slides },
          metadata: { topic: input.topic, format: 'carousel', slideCount: slides.length },
        },
      );

      ctx.emit({
        type: 'action_result',
        action: 'draft_carousel',
        ok: true,
        message: `Carousel draft saved to ${platform} queue (id: ${candidate.id}, ${slides.length} slides).`,
      });

      ctx.logger.info(
        `draft_carousel: org=${ctx.org.id} platform=${platform} slides=${slides.length} id=${candidate.id}`,
      );

      return {
        observation: `${slides.length}-slide ${platform} carousel drafted and saved to queue (id: ${candidate.id}).\nCaption: ${content.slice(0, 120)}${content.length > 120 ? '…' : ''}\nSlides: ${slides.map((s, i) => `${i + 1}. ${s.title}`).join(', ')}`,
        data: { candidateId: candidate.id, platform, slideCount: slides.length },
        emitted: true,
      };
    },
  };
}
