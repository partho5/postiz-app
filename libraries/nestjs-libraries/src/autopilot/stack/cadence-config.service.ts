/**
 * CadenceConfigService — slice 2.12
 *
 * Provides pause/resume operations on `ap_cadence_config.pausedUntil` and
 * registers the `cadence_config` proposal applier used by the chat confirm
 * pipeline (slice 1.4).
 *
 * Slot scheduler respect is already implemented in SlotSchedulerService
 * (slice 2.5): configs where `pausedUntil > now` are excluded from slot
 * materialization.  DepthEnforcerService (slice 2.10) likewise skips paused
 * configs.  No further scheduler changes are needed here.
 *
 * Proposal applier contract:
 *   targetEntity = 'cadence_config'
 *   targetId     = platform name (e.g. 'twitter', 'linkedin')
 *   changes      = subset of: { pausedUntil, postsPerDay, timezone,
 *                               preferredTimes, active }
 *   pausedUntil  = ISO datetime string to pause, or null to resume
 */

import { Injectable } from '@nestjs/common';
import { ApCadenceConfig, ApCadenceConfigSource, PrismaClient } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { registerApplier } from '@gitroom/autopilot/chat/proposals';

// ---------------------------------------------------------------------------
// Allowed fields in a cadence_config proposal
// ---------------------------------------------------------------------------

const ALLOWED_CADENCE_FIELDS = new Set([
  'pausedUntil',
  'postsPerDay',
  'timezone',
  'preferredTimes',
  'active',
]);

// ---------------------------------------------------------------------------
// Standalone applier (registered at module load)
// ---------------------------------------------------------------------------

/**
 * Apply cadence_config changes originating from the proposal pipeline.
 *
 * `targetId` must be the platform name (e.g. `'twitter'`).
 * Only fields present in ALLOWED_CADENCE_FIELDS are applied; others are
 * silently ignored to prevent arbitrary mutations.
 *
 * An upsert is used so the applier is safe to call for a tenant that has not
 * yet configured a cadence for the given platform.
 */
export async function applyCadenceConfig(
  db: PrismaClient,
  tenantId: string,
  targetId: string | null,
  changes: Record<string, unknown>,
): Promise<void> {
  if (!targetId) {
    throw new Error('cadence_config applier requires targetId (platform name)');
  }

  // Whitelist
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (ALLOWED_CADENCE_FIELDS.has(k)) safe[k] = v;
  }

  // Build the safe column values
  const columns: Record<string, unknown> = {};
  if ('pausedUntil' in safe) {
    columns.pausedUntil = safe.pausedUntil
      ? new Date(String(safe.pausedUntil))
      : null;
  }
  if ('postsPerDay' in safe) {
    columns.postsPerDay = Number(safe.postsPerDay);
  }
  if ('timezone' in safe) {
    columns.timezone = String(safe.timezone);
  }
  if ('preferredTimes' in safe) {
    columns.preferredTimes = Array.isArray(safe.preferredTimes)
      ? safe.preferredTimes
      : [];
  }
  if ('active' in safe) {
    columns.active = Boolean(safe.active);
  }

  await db.apCadenceConfig.upsert({
    where: {
      organizationId_platform: { organizationId: tenantId, platform: targetId },
    },
    create: {
      organizationId: tenantId,
      platform: targetId,
      source: ApCadenceConfigSource.AI,
      ...columns,
    },
    update: {
      source: ApCadenceConfigSource.AI,
      version: { increment: 1 },
      ...columns,
    },
  });
}

// Register on module import so the proposals pipeline can dispatch to it.
registerApplier('cadence_config', applyCadenceConfig);

// ---------------------------------------------------------------------------
// NestJS injectable service
// ---------------------------------------------------------------------------

@Injectable()
export class CadenceConfigService {
  constructor(private readonly _prisma: PrismaService) {}

  /**
   * Pause scheduling for (tenantId, platform) until the given `Date`.
   *
   * Creates the cadence config row with defaults if one does not exist yet.
   * Sets `source=USER` so it is clear this was an explicit user action.
   */
  async pause(
    tenantId: string,
    platform: string,
    until: Date,
  ): Promise<ApCadenceConfig> {
    return this._prisma.apCadenceConfig.upsert({
      where: {
        organizationId_platform: { organizationId: tenantId, platform },
      },
      create: {
        organizationId: tenantId,
        platform,
        pausedUntil: until,
        source: ApCadenceConfigSource.USER,
      },
      update: {
        pausedUntil: until,
        source: ApCadenceConfigSource.USER,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Resume scheduling for (tenantId, platform) by clearing `pausedUntil`.
   *
   * Creates the cadence config row with defaults if one does not exist yet.
   */
  async resume(
    tenantId: string,
    platform: string,
  ): Promise<ApCadenceConfig> {
    return this._prisma.apCadenceConfig.upsert({
      where: {
        organizationId_platform: { organizationId: tenantId, platform },
      },
      create: {
        organizationId: tenantId,
        platform,
        pausedUntil: null,
        source: ApCadenceConfigSource.USER,
      },
      update: {
        pausedUntil: null,
        source: ApCadenceConfigSource.USER,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Return the cadence config for (tenantId, platform), or null if none exists.
   */
  async get(
    tenantId: string,
    platform: string,
  ): Promise<ApCadenceConfig | null> {
    return this._prisma.apCadenceConfig.findUnique({
      where: {
        organizationId_platform: { organizationId: tenantId, platform },
      },
    });
  }

  /**
   * Returns true if scheduling is currently paused for (tenantId, platform).
   * A null `pausedUntil`, or one in the past, means the schedule is active.
   */
  async isPaused(tenantId: string, platform: string): Promise<boolean> {
    const config = await this.get(tenantId, platform);
    if (!config || config.pausedUntil === null) return false;
    return config.pausedUntil > new Date();
  }
}
