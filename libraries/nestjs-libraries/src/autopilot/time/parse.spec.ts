import { parseTimeExpression, formatForUser } from './parse';

// All tests anchor on this single instant so DST / weekday positions are stable.
//   2026-04-23T20:00:00Z is Thursday April 23 2026, 4:00 PM in America/New_York (EDT, UTC-4).
const NOW = new Date('2026-04-23T20:00:00Z');
const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';

describe('parseTimeExpression', () => {
  // ── null / unparseable ────────────────────────────────────────────────
  describe('rejects unparseable input', () => {
    test.each(['', '   ', 'hello world', 'asdfqwer'])(
      'returns null for %p',
      (input) => {
        expect(parseTimeExpression(input, { now: NOW, timezone: 'UTC' })).toBeNull();
      },
    );
  });

  // ── relative phrases ──────────────────────────────────────────────────
  describe('relative phrases', () => {
    test('"after 5 minutes" resolves to now + 5 min', () => {
      const r = parseTimeExpression('after 5 minutes', { now: NOW, timezone: 'UTC' });
      expect(r).not.toBeNull();
      expect(r!.date.toISOString()).toBe('2026-04-23T20:05:00.000Z');
      expect(r!.isRelative).toBe(true);
      expect(r!.isPast).toBe(false);
      expect(r!.confidence).toBe('high');
    });

    test('"in 2 hours" resolves to now + 2h', () => {
      const r = parseTimeExpression('in 2 hours', { now: NOW, timezone: 'UTC' });
      expect(r!.date.toISOString()).toBe('2026-04-23T22:00:00.000Z');
      expect(r!.isRelative).toBe(true);
    });

    test('"in 30 seconds" resolves to now + 30s', () => {
      const r = parseTimeExpression('in 30 seconds', { now: NOW, timezone: 'UTC' });
      expect(r!.date.toISOString()).toBe('2026-04-23T20:00:30.000Z');
    });

    test('user-tz does not skew relative results', () => {
      const utc = parseTimeExpression('in 2 hours', { now: NOW, timezone: 'UTC' });
      const ny = parseTimeExpression('in 2 hours', { now: NOW, timezone: NY });
      expect(utc!.date.toISOString()).toBe(ny!.date.toISOString());
    });
  });

  // ── absolute wall-clock with timezone ────────────────────────────────
  describe('absolute wall-clock honours user timezone', () => {
    test('"tomorrow 9am" in NY = 13:00 UTC next day (EDT, UTC-4)', () => {
      const r = parseTimeExpression('tomorrow 9am', { now: NOW, timezone: NY });
      expect(r!.date.toISOString()).toBe('2026-04-24T13:00:00.000Z');
      expect(r!.isRelative).toBe(true);
      expect(r!.confidence).toBe('high');
    });

    test('"tomorrow 9am" in UTC = 09:00 UTC next day', () => {
      const r = parseTimeExpression('tomorrow 9am', { now: NOW, timezone: 'UTC' });
      expect(r!.date.toISOString()).toBe('2026-04-24T09:00:00.000Z');
    });

    test('"tomorrow 9am" in Tokyo respects local calendar day', () => {
      // NOW=20:00Z is Apr 24 05:00 in Tokyo, so "tomorrow" = Apr 25.
      // 9am JST on Apr 25 = 00:00 UTC Apr 25.
      const r = parseTimeExpression('tomorrow 9am', { now: NOW, timezone: TOKYO });
      expect(r!.date.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    });

    test('"Friday 3pm" rolls to next Friday in user tz', () => {
      // Thursday now → "Friday 3pm" = Apr 24 15:00 NY = 19:00 UTC.
      const r = parseTimeExpression('Friday 3pm', { now: NOW, timezone: NY });
      expect(r!.date.toISOString()).toBe('2026-04-24T19:00:00.000Z');
    });

    test('"next Monday at 10" resolves to following Monday morning', () => {
      // Thursday Apr 23 → next Monday is Apr 27, 10:00 NY (EDT) = 14:00 UTC.
      const r = parseTimeExpression('next Monday at 10', { now: NOW, timezone: NY });
      expect(r!.date.toISOString()).toBe('2026-04-27T14:00:00.000Z');
    });
  });

  // ── bare time forward-roll ───────────────────────────────────────────
  describe('forwardOnly behaviour', () => {
    test('"3pm" when current local hour is past 3pm rolls to tomorrow', () => {
      // NOW is 16:00 NY. "3pm" (15:00) is past → tomorrow 15:00 NY = 19:00 UTC.
      const r = parseTimeExpression('3pm', { now: NOW, timezone: NY });
      expect(r!.date.toISOString()).toBe('2026-04-24T19:00:00.000Z');
      expect(r!.isPast).toBe(false);
    });

    test('forwardOnly=false allows past bare times', () => {
      const r = parseTimeExpression('3pm', {
        now: NOW,
        timezone: NY,
        forwardOnly: false,
      });
      // Today 15:00 NY = 19:00 UTC, which is > NOW (20:00 UTC)? No, 19:00 < 20:00 → past.
      expect(r!.date.toISOString()).toBe('2026-04-23T19:00:00.000Z');
      expect(r!.isPast).toBe(true);
    });
  });

  // ── ISO 8601 fast path ───────────────────────────────────────────────
  describe('ISO 8601 short-circuit', () => {
    test('explicit Z is preserved', () => {
      const r = parseTimeExpression('2026-05-01T10:00:00Z', { now: NOW });
      expect(r!.date.toISOString()).toBe('2026-05-01T10:00:00.000Z');
      expect(r!.confidence).toBe('high');
      expect(r!.isRelative).toBe(false);
    });

    test('explicit offset is preserved', () => {
      const r = parseTimeExpression('2026-05-01T10:00:00+02:00', { now: NOW });
      expect(r!.date.toISOString()).toBe('2026-05-01T08:00:00.000Z');
    });

    test('ISO without seconds is accepted', () => {
      const r = parseTimeExpression('2026-05-01T10:00Z', { now: NOW });
      expect(r!.date.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    });
  });

  // ── confidence ───────────────────────────────────────────────────────
  describe('confidence levels', () => {
    test('explicit hour → high', () => {
      expect(
        parseTimeExpression('tomorrow 9am', { now: NOW, timezone: NY })!.confidence,
      ).toBe('high');
    });

    test('day-only ("tomorrow") → medium', () => {
      // chrono fills hour with 12pm by default, but isCertain('hour') is false.
      expect(
        parseTimeExpression('tomorrow', { now: NOW, timezone: NY })!.confidence,
      ).toBe('medium');
    });
  });
});

describe('formatForUser', () => {
  test('< 60s: seconds', () => {
    expect(
      formatForUser(new Date(NOW.getTime() + 30_000), { now: NOW, timezone: 'UTC' }),
    ).toBe('in 30 seconds');
    expect(
      formatForUser(new Date(NOW.getTime() - 1_000), { now: NOW, timezone: 'UTC' }),
    ).toBe('1 second ago');
  });

  test('< 60m: minutes', () => {
    expect(
      formatForUser(new Date(NOW.getTime() + 5 * 60_000), { now: NOW, timezone: 'UTC' }),
    ).toBe('in 5 minutes');
    expect(
      formatForUser(new Date(NOW.getTime() - 60_000), { now: NOW, timezone: 'UTC' }),
    ).toBe('1 minute ago');
  });

  test('same calendar day, < 12h: hours', () => {
    const d = new Date(NOW.getTime() + 3 * 60 * 60_000); // 23:00 UTC same day
    expect(formatForUser(d, { now: NOW, timezone: 'UTC' })).toBe('in 3 hours');
  });

  test('tomorrow', () => {
    // 13:00 UTC next day → tomorrow at 9:00 AM NY (EDT)
    const d = new Date('2026-04-24T13:00:00Z');
    expect(formatForUser(d, { now: NOW, timezone: NY })).toBe('tomorrow at 9:00 AM');
  });

  test('within next 7 days uses weekday', () => {
    // Apr 27 = Monday, 14:00 UTC = 10:00 AM NY
    const d = new Date('2026-04-27T14:00:00Z');
    expect(formatForUser(d, { now: NOW, timezone: NY })).toBe('Monday at 10:00 AM');
  });

  test('beyond a week uses date', () => {
    // Apr 30 23:00 UTC = 7:00 PM NY (>7 days away from NOW Apr 23 16:00 NY)
    const d = new Date('2026-04-30T23:00:00Z');
    expect(formatForUser(d, { now: NOW, timezone: NY })).toBe('Apr 30 at 7:00 PM');
  });

  test('different year shows year', () => {
    const d = new Date('2027-01-15T14:00:00Z');
    const out = formatForUser(d, { now: NOW, timezone: NY });
    expect(out).toContain('2027');
  });

  test('yesterday', () => {
    // Apr 22 13:00 UTC = 9:00 AM NY (yesterday from NOW)
    const d = new Date('2026-04-22T13:00:00Z');
    expect(formatForUser(d, { now: NOW, timezone: NY })).toBe('yesterday at 9:00 AM');
  });
});
