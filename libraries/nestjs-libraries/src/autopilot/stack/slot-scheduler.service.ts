/**
 * SlotSchedulerService — slice 2.5
 *
 * Materializes future `ApScheduledSlot` rows from active `ApCadenceConfig`
 * entries.  Run periodically (see materialize-slots cron task) to ensure
 * each active (org, platform) pair has PENDING slots up to `lookaheadDays`
 * days into the future.
 *
 * Key concepts
 * ─────────────
 * • A cadence config says "post N times per day at these preferred HH:MM
 *   times (in this timezone)".
 * • This service converts those wall-clock times to UTC datetimes for each
 *   upcoming calendar day and inserts rows that don't already exist.
 * • Deduplication is by exact `scheduledAt` millisecond — the same cron
 *   running twice is idempotent.
 * • Configs with `active=false` or `pausedUntil > now` are skipped.
 *
 * Pure exported helpers (wallClockToUtc, buildSlotHHMMs) are unit-tested
 * independently; the NestJS service is thin integration glue.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ApCadenceConfig,
  ApScheduledSlotStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Pure helpers (exported so specs can test without DI)
// ---------------------------------------------------------------------------

/**
 * Convert a "wall clock" time (HH:MM on a specific calendar day, expressed
 * in `timezone`) to a UTC `Date` object.
 *
 * Uses the `Intl.DateTimeFormat` probe technique — no external libraries
 * required.  Accurate to ±1 minute for all IANA zones; DST boundary
 * ambiguity resolves to the first valid UTC interpretation (pre-transition
 * standard time wins).
 *
 * @param year    - Full 4-digit year (calendar day in UTC)
 * @param month   - 1-indexed month (calendar day in UTC)
 * @param day     - Day of month (calendar day in UTC)
 * @param hour    - 0-23 wall-clock hour in `timezone`
 * @param minute  - 0-59 wall-clock minute in `timezone`
 * @param timezone - IANA timezone string, e.g. "America/New_York"
 */
export function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Probe: treat the desired local time as if it were UTC.
  // The error is exactly the timezone offset — we compute and correct it.
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  // Find what the probe UTC instant looks like in the target timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(probe);

  const get = (type: string): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? '0';
    const n = parseInt(raw, 10);
    // Intl returns 24 for midnight when hour12=false; normalise to 0.
    return type === 'hour' && n === 24 ? 0 : n;
  };

  // "probe" UTC moment appears as tzY-tzMo-tzD tzH:tzMi in the target TZ.
  // offset = probe_utc_ms - probe_tz_as_utc_ms  (positive = east of UTC)
  const probeTzMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), 0);
  const offsetMs = probe.getTime() - probeTzMs;

  // Desired wall-clock time expressed as a "naive" UTC ms:
  const desiredWallMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Correct UTC = desired_wall + offset
  return new Date(desiredWallMs + offsetMs);
}

/**
 * Build the ordered list of HH:MM strings to schedule each day.
 *
 * Rules:
 * 1. If `preferredTimes` has ≥ `postsPerDay` entries → use the first
 *    `postsPerDay` preferred times.
 * 2. Otherwise use all preferred times and spread the remaining slots
 *    evenly across the 24h window, avoiding collisions.
 *
 * Returns an empty array when `postsPerDay ≤ 0`.
 * Output is sorted ascending.
 */
export function buildSlotHHMMs(
  preferredTimes: string[],
  postsPerDay: number,
): string[] {
  if (postsPerDay <= 0) return [];

  const validPreferred = preferredTimes.filter((t) =>
    /^\d{2}:\d{2}$/.test(t),
  );

  if (validPreferred.length >= postsPerDay) {
    return [...validPreferred.slice(0, postsPerDay)].sort();
  }

  // Need to fill the gap with evenly-spread times.
  const result = [...validPreferred];
  const existingMinutes = new Set(
    result.map((t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    }),
  );

  const needed = postsPerDay - result.length;
  // Space interval for `needed` extra slots (avoid 0 by treating existing
  // slots as already placed; use naive even spacing).
  const totalSlots = postsPerDay;
  const intervalMin = Math.floor((24 * 60) / totalSlots);

  // Try to place `needed` slots at evenly-spaced positions, nudging by
  // 15 min when a collision occurs.
  let placed = 0;
  for (let i = 1; placed < needed; i++) {
    let minutes = (i * intervalMin) % (24 * 60);
    let attempts = 0;
    while (existingMinutes.has(minutes) && attempts < 96) {
      minutes = (minutes + 15) % (24 * 60);
      attempts++;
    }
    if (!existingMinutes.has(minutes)) {
      existingMinutes.add(minutes);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      result.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      placed++;
    }
  }

  return result.sort();
}

// ---------------------------------------------------------------------------
// NestJS service
// ---------------------------------------------------------------------------

/** Stats returned by a single materialization run. */
export interface MaterializeResult {
  /** Total `ApScheduledSlot` rows inserted this run. */
  created: number;
  /** Number of active cadence configs processed. */
  configs: number;
}

@Injectable()
export class SlotSchedulerService {
  private readonly logger = new Logger(SlotSchedulerService.name);

  constructor(private readonly _prisma: PrismaService) {}

  /**
   * Materialize PENDING `ApScheduledSlot` rows for every active cadence
   * config, covering the window [now, now + lookaheadDays].
   *
   * Safe to call multiple times — existing PENDING slots in the window are
   * never duplicated.
   */
  async materializeSlots(lookaheadDays = 7): Promise<MaterializeResult> {
    const now = new Date();
    const horizon = new Date(
      now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000,
    );

    // Fetch all active, non-paused cadence configs.
    const configs = await this._prisma.apCadenceConfig.findMany({
      where: {
        active: true,
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
      },
    });

    let created = 0;

    for (const config of configs) {
      try {
        created += await this._materializeForConfig(config, now, horizon);
      } catch (err) {
        this.logger.error(
          `Failed to materialize slots for org=${config.organizationId} platform=${config.platform}: ${err}`,
        );
      }
    }

    this.logger.log(
      `Slot materialization complete — configs=${configs.length} created=${created}`,
    );

    return { created, configs: configs.length };
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private async _materializeForConfig(
    config: ApCadenceConfig,
    from: Date,
    horizon: Date,
  ): Promise<number> {
    const preferred = this._parsePreferredTimes(config.preferredTimes);
    const hhMMs = buildSlotHHMMs(preferred, config.postsPerDay);

    if (hhMMs.length === 0) return 0;

    // Compute the full set of desired UTC slot times.
    const desired = this._computeSlotDates(
      hhMMs,
      config.timezone ?? 'UTC',
      from,
      horizon,
    );

    if (desired.length === 0) return 0;

    // Fetch existing PENDING slots in the window to avoid duplicates.
    const existing = await this._prisma.apScheduledSlot.findMany({
      where: {
        organizationId: config.organizationId,
        platform: config.platform,
        scheduledAt: { gte: from, lte: horizon },
        status: ApScheduledSlotStatus.PENDING,
      },
      select: { scheduledAt: true },
    });

    const existingMs = new Set(existing.map((s) => s.scheduledAt.getTime()));
    const toCreate = desired.filter((d) => !existingMs.has(d.getTime()));

    if (toCreate.length === 0) return 0;

    await this._prisma.apScheduledSlot.createMany({
      data: toCreate.map((scheduledAt) => ({
        organizationId: config.organizationId,
        platform: config.platform,
        scheduledAt,
        status: ApScheduledSlotStatus.PENDING,
        metadata: {} as Prisma.InputJsonValue,
      })),
    });

    return toCreate.length;
  }

  /**
   * Iterate day-by-day in the [from, horizon] window and collect UTC slot
   * datetimes for each day based on the given HH:MM strings + timezone.
   */
  private _computeSlotDates(
    hhMMs: string[],
    timezone: string,
    from: Date,
    horizon: Date,
  ): Date[] {
    const slots: Date[] = [];

    // Start cursor at the beginning of the first UTC day that overlaps `from`.
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );

    while (cursor.getTime() <= horizon.getTime()) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1; // 1-indexed
      const day = cursor.getUTCDate();

      for (const hhMM of hhMMs) {
        const [h, m] = hhMM.split(':').map(Number);
        const utcTime = wallClockToUtc(year, month, day, h, m, timezone);

        // Only keep slots strictly inside [from, horizon].
        if (utcTime >= from && utcTime <= horizon) {
          slots.push(utcTime);
        }
      }

      // Advance one calendar day.
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return slots;
  }

  private _parsePreferredTimes(raw: Prisma.JsonValue): string[] {
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).filter(
      (t): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t),
    );
  }
}
