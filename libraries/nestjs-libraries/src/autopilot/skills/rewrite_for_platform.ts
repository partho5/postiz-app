/**
 * Platform rewrite skill — slice 3.3
 *
 * Takes an existing draft (written for one platform) and rewrites it to be
 * optimized for a different target platform, preserving the core message
 * while adapting tone, length, conventions, and hashtag strategy.
 *
 * Uses the tenant's business profile for voice consistency, and the
 * platform specs from the copywriter module for target conventions.
 *
 * Dependencies (verified against actual source files):
 *   getStructuredProfile(db, tenantId) — memory/index.ts
 *   PLATFORM_SPECS, DEFAULT_PLATFORM_SPEC, PlatformSpec — agents/copywriter.ts
 *   generateObject — ai-v5
 *   SkillEntry, SkillContext — skills/types.ts
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile, type StructuredProfile } from '../memory';
import {
  PLATFORM_SPECS,
  DEFAULT_PLATFORM_SPEC,
  type PlatformSpec,
} from '../agents/copywriter';
import type { SkillEntry, SkillContext } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RewriteInput {
  /** The original draft text to rewrite. */
  draft: string;
  /** Platform the draft was originally written for (optional, for context). */
  sourcePlatform?: string;
  /** Target platform to optimize the rewrite for. */
  targetPlatform: string;
  /** Optional extra guidelines for the rewrite. */
  guidelines?: string;
}

export interface RewriteOutput {
  /** The rewritten post body text. */
  content: string;
  /** Classification of the opening hook style. */
  hookType?: string;
  /** Call-to-action text, if any. */
  cta?: string;
  /** Suggested hashtags (without #). */
  hashtags?: string[];
  /** Character count of the rewritten content. */
  characterCount: number;
  /** The original draft for reference. */
  originalDraft: string;
  /** Target platform the content was rewritten for. */
  platform: string;
}

// ---------------------------------------------------------------------------
// Zod schema for structured LLM output
// ---------------------------------------------------------------------------

const rewriteSchema = z.object({
  content: z.string().describe('The rewritten post body text'),
  hookType: z
    .string()
    .optional()
    .describe(
      'Classification of the opening hook: question, statistic, story, bold_claim, how_to, contrarian, listicle',
    ),
  cta: z
    .string()
    .optional()
    .describe('Call-to-action text at the end, if appropriate'),
  hashtags: z
    .array(z.string())
    .optional()
    .describe('Suggested hashtags without the # symbol'),
});

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

export function buildRewritePrompt(
  sourceSpec: PlatformSpec | null,
  targetSpec: PlatformSpec,
  profile: StructuredProfile | null,
  guidelines?: string,
): string {
  const sections: string[] = [];

  // Role
  sections.push(
    'You are an expert social media copywriter specializing in cross-platform content adaptation.',
  );

  // Source context
  if (sourceSpec) {
    sections.push(
      `\nOriginal platform: ${sourceSpec.displayName}${
        sourceSpec.maxChars ? ` (${sourceSpec.maxChars} char limit)` : ''
      }`,
    );
  }

  // Target rules
  sections.push(
    `\nTarget platform: ${targetSpec.displayName}\nPlatform rules:\n${targetSpec.conventions}${
      targetSpec.maxChars
        ? `\nHard character limit: ${targetSpec.maxChars} characters.`
        : ''
    }`,
  );

  // Brand voice
  if (profile?.businessProfile) {
    const bp = profile.businessProfile;
    const voiceLines: string[] = [];
    if (bp.niche) voiceLines.push(`Niche: ${bp.niche}`);
    if (bp.brandVoiceShort) voiceLines.push(`Voice: ${bp.brandVoiceShort}`);
    if (bp.brandVoiceExtended)
      voiceLines.push(`Extended voice guide: ${bp.brandVoiceExtended}`);

    if (voiceLines.length > 0) {
      sections.push(`\nBrand identity:\n${voiceLines.join('\n')}`);
    }

    const antiPatterns = bp.antiPatterns as string[] | null;
    if (antiPatterns && Array.isArray(antiPatterns) && antiPatterns.length > 0) {
      sections.push(
        `\nAvoid these patterns:\n${antiPatterns.map((p) => `- ${p}`).join('\n')}`,
      );
    }
  }

  // Extra guidelines
  if (guidelines) {
    sections.push(`\nAdditional guidelines:\n${guidelines}`);
  }

  // Rewrite instructions
  sections.push(
    `\nRewrite the provided draft for the target platform. You must:
- Preserve the core message and brand voice
- Adapt length, tone, and formatting to the target platform's conventions
- Respect the target platform's character limit
- Adjust hashtag strategy for the target platform
- Make it feel native to the target platform, not like a copy-paste
- Keep the same overall intent and call-to-action (adapted if needed)

Output a JSON object with: content, hookType (optional), cta (optional), hashtags (optional).`,
  );

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Skill handler
// ---------------------------------------------------------------------------

/**
 * Rewrite a draft for a different platform, adapting tone, length,
 * conventions, and hashtag strategy while preserving the core message.
 */
export async function handleRewrite(
  ctx: SkillContext,
  input: RewriteInput,
): Promise<RewriteOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;

  // 1. Load profile for voice consistency.
  let profile: StructuredProfile | null = null;
  try {
    profile = await getStructuredProfile(db, tenantId);
  } catch {
    // Profile missing — proceed without voice context.
  }

  // 2. Resolve platform specs.
  const sourceSpec = input.sourcePlatform
    ? PLATFORM_SPECS[input.sourcePlatform.toLowerCase()] ?? null
    : null;
  const targetSpec =
    PLATFORM_SPECS[input.targetPlatform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

  // 3. Build the system prompt.
  const systemPrompt = buildRewritePrompt(
    sourceSpec,
    targetSpec,
    profile,
    input.guidelines,
  );

  // 4. Call LLM to rewrite.
  const { object } = await generateObject({
    model: ctx.llm.model,
    schema: rewriteSchema,
    prompt: `Rewrite this draft for ${targetSpec.displayName}:\n\n${input.draft}`,
    system: systemPrompt,
  });

  return {
    content: object.content,
    hookType: object.hookType,
    cta: object.cta,
    hashtags: object.hashtags,
    characterCount: object.content.length,
    originalDraft: input.draft,
    platform: input.targetPlatform,
  };
}

// ---------------------------------------------------------------------------
// SkillEntry
// ---------------------------------------------------------------------------

export const rewriteForPlatformSkill: SkillEntry<RewriteInput, RewriteOutput> = {
  id: 'rewrite_for_platform',
  description:
    'Rewrite an existing draft for a different social media platform, adapting tone, length, conventions, and hashtags while preserving the core message.',
  handler: handleRewrite,
};

export default rewriteForPlatformSkill;
