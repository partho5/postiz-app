/**
 * Copywriter agent — slice 3.1
 *
 * Platform-aware, voice-consistent draft generation.  Given a topic and a
 * platform, this agent:
 *
 *   1. Loads the tenant's business profile (brand voice, niche, goals,
 *      anti-patterns) via getStructuredProfile().
 *   2. Queries vector memory for relevant context (anecdotes, brand rules,
 *      learnings) using queryVector().
 *   3. Builds a rich, voice-aware system prompt combining profile data,
 *      memory context, and platform-specific conventions.
 *   4. Calls generateObject() with a Zod schema to produce structured drafts.
 *
 * Dependencies (verified against actual source files):
 *   getStructuredProfile(db, tenantId)           — memory/index.ts
 *   queryVector(db, tenantId, text, topK, kinds?) — memory/index.ts
 *   AgentDefinition, AgentContext                 — agents/types.ts
 *   generateObject                                — ai-v5
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile, queryVector, type StructuredProfile, type VectorMemoryRow } from '../memory';
import type { AgentDefinition, AgentContext } from './types';

// ---------------------------------------------------------------------------
// Platform conventions
// ---------------------------------------------------------------------------

export interface PlatformSpec {
  displayName: string;
  maxChars: number | null;
  conventions: string;
}

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  twitter: {
    displayName: 'Twitter / X',
    maxChars: 280,
    conventions:
      'Keep under 280 characters. Use punchy hooks. Hashtags: 1-3 max. Threads are acceptable for longer ideas — output the first tweet only.',
  },
  linkedin: {
    displayName: 'LinkedIn',
    maxChars: 3000,
    conventions:
      'Professional yet personable. Hook in the first line — people see only ~2 lines before "see more". Use line breaks for readability. Hashtags: 3-5 at end.',
  },
  instagram: {
    displayName: 'Instagram',
    maxChars: 2200,
    conventions:
      'Visual-first platform — content should complement an image or reel. Engaging first line. Emoji usage is natural. Hashtags: up to 10-15, placed at end or in first comment.',
  },
  facebook: {
    displayName: 'Facebook',
    maxChars: null,
    conventions:
      'Conversational tone. Ask questions to drive engagement. Shorter posts (under 250 chars) tend to perform better. Minimal hashtags.',
  },
  threads: {
    displayName: 'Threads',
    maxChars: 500,
    conventions:
      'Conversational, concise. Similar to Twitter style but slightly longer. Hashtag support is limited — focus on content.',
  },
  tiktok: {
    displayName: 'TikTok',
    maxChars: 2200,
    conventions:
      'Caption for a video post. Hook in first 2 words. Trending hashtags encouraged. Casual, energetic tone.',
  },
  youtube: {
    displayName: 'YouTube',
    maxChars: 5000,
    conventions:
      'Video description format. First 2 lines appear above the fold. Include a call-to-action. Timestamps optional. Hashtags: up to 3.',
  },
};

export const DEFAULT_PLATFORM_SPEC: PlatformSpec = {
  displayName: 'Social media',
  maxChars: null,
  conventions: 'Write an engaging social media post appropriate for the platform.',
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CopywriterInput {
  /** Target platform (e.g. 'twitter', 'linkedin'). */
  platform: string;
  /** Topic or brief describing what the post should be about. */
  topic: string;
  /** Number of draft variants to generate. Defaults to 1. */
  count?: number;
  /** Optional extra guidelines (e.g. "mention the product launch on May 5th"). */
  guidelines?: string;
}

export interface CopywriterDraft {
  /** The post body text. */
  content: string;
  /** Classification of the opening hook style. */
  hookType?: string;
  /** Call-to-action text, if any. */
  cta?: string;
  /** Suggested hashtags (without #). */
  hashtags?: string[];
  /** Character count of content. */
  characterCount: number;
}

export interface CopywriterOutput {
  drafts: CopywriterDraft[];
}

// ---------------------------------------------------------------------------
// Zod schema for structured LLM output
// ---------------------------------------------------------------------------

const draftSchema = z.object({
  drafts: z.array(
    z.object({
      content: z.string().describe('The full post body text'),
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
    }),
  ),
});

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  platformSpec: PlatformSpec,
  profile: StructuredProfile | null,
  memoryContext: VectorMemoryRow[],
  guidelines?: string,
): string {
  const sections: string[] = [];

  // Role
  sections.push(
    `You are an expert social media copywriter generating content for ${platformSpec.displayName}.`,
  );

  // Platform rules
  sections.push(
    `\nPlatform rules:\n${platformSpec.conventions}${
      platformSpec.maxChars
        ? `\nHard character limit: ${platformSpec.maxChars} characters.`
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
    if (bp.goals) voiceLines.push(`Goals: ${JSON.stringify(bp.goals)}`);

    if (voiceLines.length > 0) {
      sections.push(`\nBrand identity:\n${voiceLines.join('\n')}`);
    }

    // Anti-patterns
    const antiPatterns = bp.antiPatterns as string[] | null;
    if (antiPatterns && Array.isArray(antiPatterns) && antiPatterns.length > 0) {
      sections.push(
        `\nAvoid these patterns:\n${antiPatterns.map((p) => `- ${p}`).join('\n')}`,
      );
    }
  }

  // Growth rules
  if (profile?.growthRules && profile.growthRules.length > 0) {
    const ruleLines = profile.growthRules.map(
      (r) => `- ${r.ruleKey}: ${JSON.stringify(r.ruleValue)}`,
    );
    sections.push(`\nGrowth rules:\n${ruleLines.join('\n')}`);
  }

  // Memory context (relevant anecdotes, brand rules, learnings)
  if (memoryContext.length > 0) {
    const memLines = memoryContext.map(
      (m) => `- [${m.kind}] ${m.content}`,
    );
    sections.push(
      `\nRelevant context from memory (use naturally if it fits):\n${memLines.join('\n')}`,
    );
  }

  // Extra guidelines
  if (guidelines) {
    sections.push(`\nAdditional guidelines from the user:\n${guidelines}`);
  }

  // Output instructions
  sections.push(
    `\nGenerate the requested number of unique draft variants. Each draft should:
- Have a strong opening hook
- Be written in the brand's voice
- Respect the platform's character limit and conventions
- Be ready to post (no placeholder text)

Output a JSON object with a "drafts" array containing each variant.`,
  );

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Generate one or more social-media post drafts for the given platform and
 * topic, infused with the tenant's brand voice and relevant memory context.
 */
export async function runCopywriter(
  ctx: AgentContext,
  input: CopywriterInput,
): Promise<CopywriterOutput> {
  const db = ctx.db as PrismaClient;
  const tenantId = ctx.tenant.id;
  const count = Math.max(1, Math.min(input.count ?? 1, 10));

  // 1. Load structured profile for brand voice.
  let profile: StructuredProfile | null = null;
  try {
    profile = await getStructuredProfile(db, tenantId);
  } catch {
    // Profile missing is not fatal — generate with generic voice.
  }

  // 2. Query vector memory for relevant context.
  let memoryContext: VectorMemoryRow[] = [];
  try {
    memoryContext = await queryVector(
      db,
      tenantId,
      input.topic,
      5,
      ['BRAND_RULE', 'ANECDOTE', 'LEARNING', 'PERSONAL_STORY', 'MILESTONE'] as any[],
    );
  } catch {
    // Embedding not available or no vectors — proceed without memory.
  }

  // 3. Resolve platform spec.
  const platformSpec =
    PLATFORM_SPECS[input.platform.toLowerCase()] ?? DEFAULT_PLATFORM_SPEC;

  // 4. Build the system prompt.
  const systemPrompt = buildSystemPrompt(
    platformSpec,
    profile,
    memoryContext,
    input.guidelines,
  );

  // 5. Generate drafts via structured LLM output.
  const prompt =
    count === 1
      ? `Write 1 ${platformSpec.displayName} post about: ${input.topic}`
      : `Write ${count} unique ${platformSpec.displayName} post variants about: ${input.topic}`;

  const { object } = await generateObject({
    model: ctx.llm.model,
    schema: draftSchema,
    prompt,
    system: systemPrompt,
  });

  // 6. Map results + compute character counts.
  const drafts: CopywriterDraft[] = object.drafts.map((d) => ({
    content: d.content,
    hookType: d.hookType,
    cta: d.cta,
    hashtags: d.hashtags,
    characterCount: d.content.length,
  }));

  return { drafts };
}

// ---------------------------------------------------------------------------
// Exported system prompt (for testing / inspection)
// ---------------------------------------------------------------------------

const COPYWRITER_SYSTEM_PROMPT = `\
You are an expert social media copywriter for an AI-powered autopilot platform.

Your role: generate platform-appropriate, voice-consistent social media post drafts.
You read the tenant's brand voice, business context, and relevant memories to
produce content that sounds authentically like the brand — never generic.

For each draft you produce:
  content    — the full post body text, ready to publish
  hookType   — how the post opens (question, statistic, story, bold_claim, how_to, contrarian, listicle)
  cta        — call-to-action if appropriate
  hashtags   — relevant hashtags without the # symbol

Respect platform character limits. Write in the brand's voice. Be original.`;

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

export const copywriterAgent: AgentDefinition<CopywriterInput, CopywriterOutput> = {
  id: 'copywriter',
  systemPrompt: COPYWRITER_SYSTEM_PROMPT,
  allowedSkills: [],
  run: runCopywriter,
};

export default copywriterAgent;
