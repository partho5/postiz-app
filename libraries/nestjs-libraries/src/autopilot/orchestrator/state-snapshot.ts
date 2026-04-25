/**
 * State snapshot builder — slice 1.3.c
 *
 * Produces the multi-line text block injected into the orchestrator's
 * system prompt each turn. The snapshot tells the LLM:
 *
 *   - the current wall-clock & user timezone (so it can resolve "now",
 *     "tomorrow", etc. when planning tool calls)
 *   - the tenant's niche & data-sharing posture (so replies stay on-brand)
 *   - which platforms are connected (so it doesn't propose impossible posts)
 *   - any active per-platform cadence (so it knows when posts already go out)
 *   - whether a multi-turn post-creation flow is already pending — and at
 *     which step it is waiting (so a follow-up like "after 5 minutes"
 *     resolves the pending question instead of starting over)
 *   - how many scheduled posts are queued in the next week
 *
 * Pure function: deterministic, no LLM. Anything that requires LLM
 * judgement happens *after* the snapshot is read.
 */

import type { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { formatForUser } from '../time/parse';

export interface StateSnapshotInput {
  organizationId: string;
  now: Date;
  timezone: string;
  tenantCtx?: {
    niche?: string;
    goals?: unknown;
    strategyOptout?: boolean;
  };
}

export interface PendingActionSnapshot {
  id: string;
  waitingFor: string;
  collectedData: Record<string, unknown>;
  expiresAt: Date;
}

export interface CadenceSnapshot {
  platform: string;
  postsPerDay: number;
  preferredTimes: string[];
  pausedUntil: Date | null;
}

export interface UpcomingSlotSnapshot {
  id: string;
  platform: string;
  scheduledAt: Date;
}

export interface StateSnapshotData {
  now: Date;
  timezone: string;
  niche: string | null;
  strategyOptout: boolean | null;
  connectedPlatforms: string[];
  cadences: CadenceSnapshot[];
  pendingAction: PendingActionSnapshot | null;
  upcomingScheduled: UpcomingSlotSnapshot[];
  upcomingScheduledCount: number;
}

/**
 * Gathers the raw snapshot data from prisma. Kept separate from
 * `formatStateSnapshot` so callers (and tests) can inspect the structured
 * data, and so the formatter is purely functional over fixtures.
 */
export async function buildStateSnapshot(
  db: PrismaService,
  input: StateSnapshotInput,
): Promise<StateSnapshotData> {
  const { organizationId, now, timezone, tenantCtx } = input;

  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const [integrations, cadenceRows, pendingRow, upcomingRows, upcomingCount] =
    await Promise.all([
      db.integration.findMany({
        where: {
          organizationId,
          disabled: false,
          refreshNeeded: false,
          deletedAt: null,
        },
        select: { providerIdentifier: true },
      }),
      db.apCadenceConfig.findMany({
        where: { organizationId, active: true },
        select: {
          platform: true,
          postsPerDay: true,
          preferredTimes: true,
          pausedUntil: true,
        },
      }),
      db.apPendingAction.findUnique({
        where: { organizationId },
      }),
      db.apScheduledSlot.findMany({
        where: {
          organizationId,
          scheduledAt: { gte: now, lte: weekFromNow },
          status: 'PENDING',
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: { id: true, platform: true, scheduledAt: true },
      }),
      db.apScheduledSlot.count({
        where: {
          organizationId,
          scheduledAt: { gte: now, lte: weekFromNow },
          status: 'PENDING',
        },
      }),
    ]);

  const connectedPlatforms = [
    ...new Set(integrations.map((i) => i.providerIdentifier)),
  ];

  const cadences: CadenceSnapshot[] = cadenceRows.map((c) => ({
    platform: c.platform,
    postsPerDay: c.postsPerDay,
    preferredTimes: Array.isArray(c.preferredTimes)
      ? (c.preferredTimes as unknown[]).map(String)
      : [],
    pausedUntil: c.pausedUntil ?? null,
  }));

  const pendingAction: PendingActionSnapshot | null =
    pendingRow && pendingRow.expiresAt > now
      ? {
          id: pendingRow.id,
          waitingFor: pendingRow.waitingFor,
          collectedData:
            (pendingRow.collectedData as Record<string, unknown> | null) ?? {},
          expiresAt: pendingRow.expiresAt,
        }
      : null;

  return {
    now,
    timezone,
    niche: tenantCtx?.niche ?? null,
    strategyOptout: tenantCtx?.strategyOptout ?? null,
    connectedPlatforms,
    cadences,
    pendingAction,
    upcomingScheduled: upcomingRows.map((s) => ({
      id: s.id,
      platform: s.platform,
      scheduledAt: s.scheduledAt,
    })),
    upcomingScheduledCount: upcomingCount,
  };
}

/**
 * Renders a snapshot into a compact text block ready to drop into the
 * orchestrator system prompt under a `<state>...</state>` fence.
 *
 * Order matters here: the most action-relevant facts (pending step + time)
 * come first so they win the LLM's attention even when the prompt is long.
 */
export function formatStateSnapshot(snapshot: StateSnapshotData): string {
  const lines: string[] = [];

  lines.push(`now: ${snapshot.now.toISOString()} (user tz: ${snapshot.timezone})`);

  if (snapshot.pendingAction) {
    const pa = snapshot.pendingAction;
    const collected = describeCollected(pa.collectedData);
    lines.push(
      `pending_action: post creation in progress — waiting for "${pa.waitingFor}"` +
        (collected ? ` | collected so far: ${collected}` : ''),
    );
  } else {
    lines.push('pending_action: none');
  }

  lines.push(
    `connected_platforms: ${
      snapshot.connectedPlatforms.length
        ? snapshot.connectedPlatforms.join(', ')
        : '(none — user has not connected any social account yet)'
    }`,
  );

  if (snapshot.niche) lines.push(`niche: ${snapshot.niche}`);

  if (snapshot.strategyOptout !== null) {
    lines.push(
      `data_sharing: ${snapshot.strategyOptout ? 'opted out' : 'opted in'} of anonymized strategy contributions`,
    );
  }

  if (snapshot.cadences.length) {
    const cadenceLines = snapshot.cadences.map((c) => {
      const paused =
        c.pausedUntil && c.pausedUntil > snapshot.now
          ? ` (paused until ${c.pausedUntil.toISOString()})`
          : '';
      const times = c.preferredTimes.length
        ? ` at ${c.preferredTimes.join('/')}`
        : '';
      return `  - ${c.platform}: ${c.postsPerDay}/day${times}${paused}`;
    });
    lines.push('active_cadence:');
    lines.push(...cadenceLines);
  }

  lines.push(`upcoming_scheduled_next_7d: ${snapshot.upcomingScheduledCount}`);
  if (snapshot.upcomingScheduled.length) {
    const slotLines = snapshot.upcomingScheduled.map((s) => {
      const human = formatForUser(s.scheduledAt, {
        now: snapshot.now,
        timezone: snapshot.timezone,
      });
      return `  - ${s.platform}: ${human} (${s.scheduledAt.toISOString()})`;
    });
    lines.push(...slotLines);
  }

  return lines.join('\n');
}

/**
 * Compact one-line description of the data already gathered in a pending
 * post-creation flow. Used inside the snapshot so the LLM can decide
 * whether the user is answering a follow-up vs. starting fresh.
 */
function describeCollected(collected: Record<string, unknown>): string {
  const parts: string[] = [];

  const platforms = collected.platforms as unknown;
  if (Array.isArray(platforms) && platforms.length) {
    parts.push(`platforms=${platforms.map(String).join('/')}`);
  }

  const topics = collected.topics as unknown;
  if (Array.isArray(topics) && topics.length) {
    const label = topics.length === 1
      ? `topic="${truncate(String(topics[0]), 60)}"`
      : `topics=${topics.length} (${topics.slice(0, 3).map((t) => truncate(String(t), 20)).join('/')})`;
    parts.push(label);
  } else if (typeof collected.content === 'string' && collected.content.length) {
    parts.push(`content="${truncate(collected.content, 60)}"`);
  }

  if (collected.immediate === true) {
    parts.push('timing=now');
  } else if (typeof collected.startTime === 'string' && collected.startTime) {
    parts.push(`timing=${collected.startTime}`);
    if (typeof collected.intervalMinutes === 'number') {
      parts.push(`interval=${collected.intervalMinutes}min`);
    }
  }

  const postStack = collected.postStack as unknown;
  if (Array.isArray(postStack) && postStack.length) {
    parts.push(`drafts_ready=${postStack.length}`);
  }

  if (typeof collected.wantsImage === 'boolean') {
    parts.push(`image=${collected.wantsImage ? 'yes' : 'no'}`);
  }

  return parts.join(', ');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
