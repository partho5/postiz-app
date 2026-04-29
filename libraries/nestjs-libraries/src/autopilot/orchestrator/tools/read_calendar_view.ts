/**
 * `read_calendar_view` tool — slice E.4
 *
 * Returns upcoming scheduled posts grouped by calendar day so the user can
 * see their posting schedule in a week/multi-week view.
 *
 * Pure read — LLM narrates. No SSE card emitted.
 *
 * Use when the user asks "show me my calendar", "what's on my schedule this
 * week?", "give me a weekly overview". NOT for listing individual post details
 * — use list_scheduled_posts for that. NOT for reading slot config times —
 * use read_time_slots for that.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  startDate: z
    .string()
    .optional()
    .describe(
      'ISO date string for the first day of the calendar (e.g. "2026-05-01"). Defaults to today.',
    ),
  weeks: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe('How many weeks to display (1–8). Defaults to 2.'),
  platform: z
    .string()
    .optional()
    .describe('Filter to one platform slug (e.g. "linkedin"). Omit for all.'),
});

export type ReadCalendarViewInput = z.infer<typeof inputSchema>;

export interface CalendarDay {
  date: string; // "YYYY-MM-DD"
  posts: Array<{
    id: string;
    platform: string;
    contentSnippet: string;
    scheduledAt: string; // ISO
    status: string;
  }>;
}

export interface ReadCalendarViewOutput {
  startDate: string;
  endDate: string;
  totalPosts: number;
  days: CalendarDay[];
}

export function createReadCalendarViewTool(): OrchestratorTool<
  ReadCalendarViewInput,
  ReadCalendarViewOutput
> {
  return {
    name: 'read_calendar_view',
    description:
      "Show upcoming scheduled posts grouped by calendar day (weekly/multi-week view). Use when the user asks 'show my calendar', 'what's on my schedule this week?', 'give me a weekly overview'. NOT for listing individual post details — use list_scheduled_posts. NOT for slot config times — use read_time_slots.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const weeks = input.weeks ?? 2;

      // Determine start — parse user-supplied date or fall back to today
      let start: Date;
      if (input.startDate) {
        const parsed = new Date(input.startDate + 'T00:00:00Z');
        start = isNaN(parsed.getTime()) ? ctx.now : parsed;
      } else {
        // Beginning of today in UTC (close enough for calendar bucketing)
        const n = ctx.now;
        start = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
      }

      const end = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60_000);

      const slots = await ctx.db.apScheduledSlot.findMany({
        where: {
          organizationId: ctx.org.id,
          status: 'PENDING',
          scheduledAt: { gte: start, lt: end },
          ...(input.platform ? { platform: input.platform } : {}),
        },
        orderBy: { scheduledAt: 'asc' },
        include: { postCandidate: { select: { content: true } } },
      });

      // Group slots by UTC date string "YYYY-MM-DD"
      const byDate = new Map<string, CalendarDay['posts']>();
      for (const s of slots) {
        const d = s.scheduledAt;
        const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push({
          id: s.id,
          platform: s.platform,
          contentSnippet: truncate(s.postCandidate?.content ?? '', 70),
          scheduledAt: s.scheduledAt.toISOString(),
          status: s.status,
        });
      }

      // Build dense day list (only days that have posts)
      const days: CalendarDay[] = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, posts]) => ({ date, posts }));

      const startDateStr = isoDate(start);
      const endDateStr = isoDate(new Date(end.getTime() - 1));

      const observation = buildObservation(days, weeks, input.platform, startDateStr, endDateStr);

      ctx.logger.info(
        `read_calendar_view: org=${ctx.org.id} weeks=${weeks} totalPosts=${slots.length}`,
      );

      return {
        observation,
        data: {
          startDate: startDateStr,
          endDate: endDateStr,
          totalPosts: slots.length,
          days,
        },
      };
    },
  };
}

function buildObservation(
  days: CalendarDay[],
  weeks: number,
  platform: string | undefined,
  startDate: string,
  endDate: string,
): string {
  if (days.length === 0) {
    const pfx = platform ? `No scheduled ${platform} posts` : 'No scheduled posts';
    return `${pfx} from ${startDate} to ${endDate}.`;
  }

  const totalPosts = days.reduce((s, d) => s + d.posts.length, 0);
  const lines: string[] = [
    `${weeks}-week calendar (${startDate} → ${endDate}) — ${totalPosts} post(s) across ${days.length} day(s):`,
  ];
  for (const day of days) {
    lines.push(`\n  ${day.date} (${day.posts.length} post${day.posts.length === 1 ? '' : 's'}):`);
    for (const p of day.posts) {
      const time = p.scheduledAt.slice(11, 16); // "HH:MM"
      lines.push(`    ${time} UTC [${p.platform}] "${p.contentSnippet}"`);
    }
  }
  return lines.join('\n');
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
