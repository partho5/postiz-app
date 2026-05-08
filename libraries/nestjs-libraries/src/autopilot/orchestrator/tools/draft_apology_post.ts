/**
 * `draft_apology_post` tool — slice E.9
 *
 * Uses the LLM to draft an apology or clarification post for a crisis
 * situation. Optionally pushes the draft to the post stack.
 *
 * Use for: "write an apology post about X", "draft a crisis response for Y",
 * "help me clarify what happened with Z".
 * NOT for scheduling existing drafts — use schedule_post for that.
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { push } from '../../stack';
import { getStructuredProfile } from '../../memory';
import { PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC } from '../../agents/copywriter';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  situation: z
    .string()
    .min(1)
    .describe('What happened — describe the crisis or issue that needs a public response.'),
  platform: z
    .string()
    .optional()
    .describe('Platform slug (e.g. "twitter", "linkedin"). Defaults to "twitter".'),
  tone: z
    .enum(['empathetic', 'formal', 'brief'])
    .optional()
    .describe('Tone of the apology. "empathetic" (default), "formal", or "brief".'),
  pushToDraft: z
    .boolean()
    .optional()
    .describe(
      'When true, saves the generated post as a PENDING draft. ' +
        'When false (default), returns the draft text in the observation only.',
    ),
});

export type DraftApologyPostInput = z.infer<typeof inputSchema>;

export interface DraftApologyPostOutput {
  content: string;
  platform: string;
  candidateId?: string;
  pushed: boolean;
}

const outputSchema = z.object({
  content: z.string().describe('The full text of the apology/clarification post.'),
});

export function createDraftApologyPostTool(): OrchestratorTool<
  DraftApologyPostInput,
  DraftApologyPostOutput
> {
  return {
    name: 'draft_apology_post',
    description:
      'Draft an apology or clarification post for a crisis situation using the LLM. ' +
      'Set pushToDraft=true to save it as a draft. ' +
      'NOT for scheduling existing drafts — use schedule_post for that. ' +
      'NOT for notifying internal team — use send_stakeholder_alert for that.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const platform = input.platform ?? 'twitter';
      const tone = input.tone ?? 'empathetic';
      const spec = PLATFORM_SPECS[platform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );

      const bp = profile?.businessProfile;
      const brandBlock = bp
        ? [
            bp.brandVoiceShort ? `Brand voice: ${bp.brandVoiceShort}` : '',
            Array.isArray(bp.antiPatterns) && bp.antiPatterns.length
              ? `Avoid: ${(bp.antiPatterns as string[]).join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      const toneInstructions: Record<string, string> = {
        empathetic:
          'Write with genuine empathy. Acknowledge feelings. Take responsibility clearly.',
        formal:
          'Write in a formal, professional tone. Avoid contractions. Be precise.',
        brief: 'Write a short, direct apology. Keep it under 3 sentences if possible.',
      };

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are drafting a crisis response / apology post for ${spec.displayName}.`,
          spec.maxChars ? `Keep it under ${spec.maxChars} characters.` : '',
          `Platform conventions: ${spec.conventions}`,
          toneInstructions[tone] ?? toneInstructions.empathetic,
          brandBlock,
          'Do not use corporate-speak like "we apologize for any inconvenience". Be genuine.',
        ]
          .filter(Boolean)
          .join('\n'),
        prompt: `Write an apology/clarification post about the following situation:\n${input.situation}`,
      });

      const content = object.content;

      if (input.pushToDraft) {
        const candidate = await push(
          ctx.db as unknown as PrismaClient,
          ctx.org.id,
          platform,
          content,
          {
            source: 'chat_agent',
            priority: 10,
            metadata: { situation: input.situation, format: 'apology_post', tone },
          },
        );

        ctx.emit({
          type: 'action_result',
          action: 'draft_apology_post',
          ok: true,
          message: `Apology draft saved to ${platform} queue (ID: ${candidate.id}).`,
        });

        ctx.logger.info(
          `draft_apology_post: org=${ctx.org.id} platform=${platform} pushed candidateId=${candidate.id}`,
        );

        return {
          observation: `Apology post drafted and saved to the ${platform} queue.\n\nDraft:\n${content}`,
          data: { content, platform, candidateId: candidate.id, pushed: true },
          emitted: true,
        };
      }

      ctx.logger.info(
        `draft_apology_post: org=${ctx.org.id} platform=${platform} (preview only, not pushed)`,
      );

      return {
        observation: `Here is a draft apology post for ${platform}:\n\n${content}\n\nTo save it as a draft, ask me to push it to the queue.`,
        data: { content, platform, pushed: false },
        emitted: false,
      };
    },
  };
}
