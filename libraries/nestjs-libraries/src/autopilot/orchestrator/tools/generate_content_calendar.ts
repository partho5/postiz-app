/**
 * `generate_content_calendar` tool — slice E.7
 *
 * Uses the LLM to produce a content calendar for the next N weeks: one topic
 * idea per planned slot, with suggested format and platform. Pure read —
 * returns the plan, does not push to stack (user follows up with schedule_post
 * or draft_thread etc.).
 *
 * Use when the user asks "plan my content for the next 2 weeks", "create a
 * content calendar", "give me a posting plan for May".
 */

import { generateObject } from 'ai-v5';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { getStructuredProfile } from '../../memory';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  weeks: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('Number of weeks to plan (1–4). Defaults to 2.'),
  platform: z
    .string()
    .optional()
    .describe('Focus calendar on a single platform. Omit for mixed-platform plan.'),
  postsPerWeek: z
    .number()
    .int()
    .min(1)
    .max(7)
    .optional()
    .describe('Planned posts per week (1–7). Defaults to 3.'),
});

export type GenerateContentCalendarInput = z.infer<typeof inputSchema>;

export interface CalendarEntry {
  week: number;
  dayOfWeek: string;
  platform: string;
  topic: string;
  format: string;
}

export interface GenerateContentCalendarOutput {
  weeks: number;
  totalPosts: number;
  entries: CalendarEntry[];
}

const outputSchema = z.object({
  entries: z.array(
    z.object({
      week: z.number().int().describe('Week number (1-based).'),
      dayOfWeek: z.string().describe('Day of week (e.g. "Monday", "Wednesday").'),
      platform: z.string().describe('Target platform slug.'),
      topic: z.string().describe('Specific post topic or title.'),
      format: z
        .string()
        .describe('Suggested format: "short post", "thread", "carousel", "longform", "poll".'),
    }),
  ),
});

export function createGenerateContentCalendarTool(): OrchestratorTool<
  GenerateContentCalendarInput,
  GenerateContentCalendarOutput
> {
  return {
    name: 'generate_content_calendar',
    description:
      'Generate a content calendar plan for the next 1–4 weeks with specific topic ideas and formats per slot. Use for "plan my content for 2 weeks", "create a content calendar", "give me a posting plan". Pure read — does not push drafts to queue.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const weeks = input.weeks ?? 2;
      const postsPerWeek = input.postsPerWeek ?? 3;
      const totalPosts = weeks * postsPerWeek;

      const profile = await getStructuredProfile(
        ctx.db as unknown as PrismaClient,
        ctx.org.id,
      );
      const bp = profile?.businessProfile;

      const nicheBlock = bp
        ? `Niche: ${bp.niche ?? 'general'}, Goals: ${JSON.stringify(bp.goals ?? [])}, Voice: ${bp.brandVoiceShort ?? 'professional'}`
        : 'No profile — use varied, professional content.';

      const platformConstraint = input.platform
        ? `All posts should be for ${input.platform}.`
        : 'Vary platforms: use twitter, linkedin, and instagram.';

      const { object } = await generateObject({
        model: ctx.llm.model,
        schema: outputSchema,
        system: [
          `You are a content strategist planning exactly ${totalPosts} posts across ${weeks} week(s).`,
          nicheBlock,
          platformConstraint,
          'Spread posts evenly across days. Vary formats and topics to avoid repetition.',
          'Week numbers start at 1. Use specific, actionable topics — not generic placeholders.',
        ].join('\n'),
        prompt: `Generate a content calendar: ${weeks} week(s), ${postsPerWeek} posts per week.`,
      });

      const entries = object.entries.slice(0, totalPosts) as CalendarEntry[];

      const weekGroups = new Map<number, CalendarEntry[]>();
      for (const e of entries) {
        if (!weekGroups.has(e.week)) weekGroups.set(e.week, []);
        weekGroups.get(e.week)!.push(e);
      }

      const lines: string[] = [`Content calendar — ${weeks} week(s), ${postsPerWeek} posts/week:\n`];
      for (const [week, posts] of Array.from(weekGroups.entries()).sort(([a], [b]) => a - b)) {
        lines.push(`Week ${week}:`);
        for (const p of posts) {
          lines.push(`  ${p.dayOfWeek} [${p.platform}] ${p.format}: ${p.topic}`);
        }
      }

      ctx.logger.info(
        `generate_content_calendar: org=${ctx.org.id} weeks=${weeks} posts=${entries.length}`,
      );

      return {
        observation: lines.join('\n'),
        data: { weeks, totalPosts: entries.length, entries },
      };
    },
  };
}
