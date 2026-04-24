/**
 * Time-expression parser — slice 1.3.a
 *
 * Deterministic, locale-aware parser for natural-language time phrases
 * like "after 5 minutes", "tomorrow 9am", "Friday 3pm" or ISO 8601
 * strings. Used as the first pass for any tool that takes a `when`
 * argument; the orchestrator agent (slice 1.3.c) falls back to LLM
 * disambiguation only when this returns null.
 *
 * Strategy:
 *   1. ISO 8601 inputs short-circuit through `new Date(...)`.
 *   2. Otherwise, build a "ref" date whose server-local components match
 *      `now`'s wall-clock components in the user's timezone.
 *   3. Run chrono.parse on that ref so "tomorrow" rolls correctly.
 *   4. Extract the parsed Y/M/D/h/m components and convert wall-clock →
 *      real UTC via `wallClockToUtc` (re-used from slot-scheduler).
 */

import * as chrono from 'chrono-node';
import { wallClockToUtc } from '../stack/slot-scheduler.service';

export interface ParsedTime {
  /** Resolved UTC moment. */
  date: Date;
  /** True for relative phrases like "in 5 minutes", "tomorrow", "next Monday". */
  isRelative: boolean;
  /** True if the resolved time is before `now`. */
  isPast: boolean;
  /** The exact substring chrono matched (or the input for ISO). */
  sourcePhrase: string;
  /** `high` = explicit hour given; `medium` = day only; `low` = barely parseable. */
  confidence: 'high' | 'medium' | 'low';
}

export interface ParseTimeOptions {
  now?: Date;
  /** IANA timezone (e.g. "America/New_York"). Defaults to "UTC". */
  timezone?: string;
  /** When true (default), bare past times like "3pm" when now=4pm roll to tomorrow. */
  forwardOnly?: boolean;
}

const ISO_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

const RELATIVE_HINT_REGEX =
  /\b(in|after|next|tomorrow|tonight|now|ago|later|yesterday|today)\b|^\s*\d+\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|month|months)\b/i;

export function parseTimeExpression(
  input: string,
  options: ParseTimeOptions = {},
): ParsedTime | null {
  const text = (input ?? '').trim();
  if (!text) return null;

  const now = options.now ?? new Date();
  const timezone = options.timezone ?? 'UTC';
  const forwardOnly = options.forwardOnly !== false;

  // ── Fast path: ISO 8601 ──────────────────────────────────────────────
  if (ISO_REGEX.test(text)) {
    const d = new Date(text);
    if (!isNaN(d.getTime())) {
      return {
        date: d,
        isRelative: false,
        isPast: d.getTime() < now.getTime(),
        sourcePhrase: text,
        confidence: 'high',
      };
    }
  }

  // ── Natural language via chrono ──────────────────────────────────────
  // Build a reference Date whose server-local fields match the user's
  // wall-clock fields right now in `timezone`.  This lets chrono compute
  // "tomorrow", "next Monday", etc. correctly regardless of server tz.
  const ref = nowAsTzWallClock(now, timezone);

  const results = chrono.parse(text, ref, { forwardDate: forwardOnly });
  if (results.length === 0) return null;

  const start = results[0].start;

  const Y = start.get('year') ?? ref.getFullYear();
  const M = start.get('month') ?? ref.getMonth() + 1;
  const D = start.get('day') ?? ref.getDate();
  const h = start.get('hour') ?? 0;
  const m = start.get('minute') ?? 0;
  const s = start.get('second') ?? 0;

  // wallClockToUtc resolves at minute granularity; add seconds on top.
  const date = new Date(
    wallClockToUtc(Y, M, D, h, m, timezone).getTime() + s * 1000,
  );

  const isRelative = RELATIVE_HINT_REGEX.test(text);

  let confidence: ParsedTime['confidence'];
  if (start.isCertain('hour')) confidence = 'high';
  else if (start.isCertain('day') || isRelative) confidence = 'medium';
  else confidence = 'low';

  return {
    date,
    isRelative,
    isPast: date.getTime() < now.getTime(),
    sourcePhrase: results[0].text,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// formatForUser
// ---------------------------------------------------------------------------

export interface FormatTimeOptions {
  now?: Date;
  timezone?: string;
}

/**
 * Humanize a UTC Date into a user-facing string.
 *
 *   < 60s         → "in 30 seconds" / "30 seconds ago"
 *   < 60m         → "in 5 minutes" / "5 minutes ago"
 *   same calendar day, < 12h → "in 3 hours" / "3 hours ago"
 *   today         → "today at 3:00 PM"
 *   ±1 day        → "tomorrow at 9:00 AM" / "yesterday at 9:00 AM"
 *   within 7d     → "Friday at 3:00 PM"
 *   else          → "Apr 25 at 3:00 PM"  (or with year if different)
 */
export function formatForUser(
  date: Date,
  options: FormatTimeOptions = {},
): string {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? 'UTC';
  const deltaMs = date.getTime() - now.getTime();
  const past = deltaMs < 0;
  const absMs = Math.abs(deltaMs);

  if (absMs < 60_000) {
    const secs = Math.max(1, Math.round(absMs / 1000));
    return past
      ? `${secs} second${secs === 1 ? '' : 's'} ago`
      : `in ${secs} second${secs === 1 ? '' : 's'}`;
  }

  if (absMs < 60 * 60_000) {
    const mins = Math.round(absMs / 60_000);
    return past
      ? `${mins} minute${mins === 1 ? '' : 's'} ago`
      : `in ${mins} minute${mins === 1 ? '' : 's'}`;
  }

  const dayDiff = calendarDayDiff(now, date, timezone);

  if (dayDiff === 0 && absMs < 12 * 60 * 60_000) {
    const hours = Math.round(absMs / (60 * 60_000));
    return past
      ? `${hours} hour${hours === 1 ? '' : 's'} ago`
      : `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  if (dayDiff === 0) return `today at ${timeStr}`;
  if (dayDiff === 1) return `tomorrow at ${timeStr}`;
  if (dayDiff === -1) return `yesterday at ${timeStr}`;
  if (dayDiff > 0 && dayDiff < 7) {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    }).format(date);
    return `${weekday} at ${timeStr}`;
  }

  const sameYear = sameCalendarYear(now, date, timezone);
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);

  return `${dateStr} at ${timeStr}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date `d` whose server-local Y/M/D/h/m/s match the given UTC
 * `now`'s wall-clock components in `timezone`.  Used to feed chrono so
 * "tomorrow"/"next Monday" resolve against the user's local day.
 */
function nowAsTzWallClock(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string): number => {
    const v = parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
    return t === 'hour' && v === 24 ? 0 : v;
  };
  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

function tzCalendarParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const get = (t: string): number =>
    parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function calendarDayDiff(a: Date, b: Date, timezone: string): number {
  const pa = tzCalendarParts(a, timezone);
  const pb = tzCalendarParts(b, timezone);
  const aMs = Date.UTC(pa.year, pa.month - 1, pa.day);
  const bMs = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((bMs - aMs) / 86_400_000);
}

function sameCalendarYear(a: Date, b: Date, timezone: string): boolean {
  return tzCalendarParts(a, timezone).year === tzCalendarParts(b, timezone).year;
}
