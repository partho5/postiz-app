/**
 * Writing-prompts helpers — slice E.8
 *
 * Manages the tenant's library of long writing-instruction prompts that shape
 * HOW the copywriter generates content (voice, style, rules) — not WHAT to
 * post about.
 *
 * getActiveWritingPrompts  — load all active prompts ordered by ordinal ASC
 * autoGenerateAndSavePrompt — generate an AI writing style guide from the
 *                             business profile and save it with source=AI
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import type { PrismaClient, ApWritingPrompt } from '@prisma/client';
import type { LanguageModel } from 'ai-v5';
import { getStructuredProfile } from './index';

export type { ApWritingPrompt };

export async function getActiveWritingPrompts(
  db: PrismaClient,
  orgId: string,
): Promise<ApWritingPrompt[]> {
  return db.apWritingPrompt.findMany({
    where: { organizationId: orgId, active: true },
    orderBy: { ordinal: 'asc' },
  });
}

const promptSchema = z.object({
  content: z
    .string()
    .describe(
      'A 2–5 sentence writing style guide derived from the business profile. ' +
        'Cover voice, tone, structural preferences, and any hard rules.',
    ),
});

export async function autoGenerateAndSavePrompt(
  db: PrismaClient,
  orgId: string,
  llm: LanguageModel,
): Promise<string> {
  const profile = await getStructuredProfile(db, orgId);
  const bp = profile?.businessProfile;

  const contextBlock = bp
    ? [
        bp.niche ? `Niche: ${bp.niche}` : '',
        bp.brandVoiceShort ? `Voice summary: ${bp.brandVoiceShort}` : '',
        bp.brandVoiceExtended ? `Extended voice: ${bp.brandVoiceExtended}` : '',
        bp.goals ? `Goals: ${JSON.stringify(bp.goals)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No business profile available — create a general, professional writing style guide.';

  const { object } = await generateObject({
    model: llm,
    schema: promptSchema,
    system:
      'You are a brand strategist. Given a business profile, write a concise writing style guide ' +
      '(2–5 sentences) that a copywriter can follow when drafting social media posts. ' +
      'Cover voice, tone, preferred structures, and hard rules (things to avoid).',
    prompt: `Business profile:\n${contextBlock}\n\nWrite the style guide.`,
  });

  await db.apWritingPrompt.create({
    data: {
      organizationId: orgId,
      content: object.content,
      source: 'AI',
      active: true,
      ordinal: 0,
    },
  });

  return object.content;
}
