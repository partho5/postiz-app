/**
 * DepthEnforcerService — slice 2.10
 *
 * Checks the post-candidate stack depth for every active (org, platform) pair
 * derived from `ap_cadence_config` and identifies deficits — pairs whose depth
 * has fallen below the minimum threshold.
 *
 * Minimum-depth formula (per cadence config):
 *   minDepth = max(MIN_STACK_ABSOLUTE, postsPerDay × MIN_STACK_DAYS_BUFFER)
 *
 * When a deficit is detected, `assessStock()` (stock-keeper agent, slice 2.8)
 * is called and the resulting 'refill' signal is logged as a warning.  The
 * copywriter agent will be wired in Phase 3 (slice 3.2) to actually generate
 * new candidates in response to these signals.
 *
 * This service is read-only — it performs no writes.  It is safe to call
 * concurrently (each call fetches a fresh snapshot and logs independently).
 *
 * "Never empty" invariant (slice 2.10 requirement):
 *   Any active (org, platform) pair in the cadence plan that hits depth=0 is
 *   always captured here as a deficit with deficit=minDepth, surfacing it for
 *   operators and future automation before the next scheduled slot fires.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { depth } from './index';
import { assessStock, type StockKeeperOutput } from '@gitroom/autopilot/agents/stock-keeper';

// ---------------------------------------------------------------------------
// Threshold constants (exported for tests and the cron task log)
// ---------------------------------------------------------------------------

/** Hard floor: every active stack must have at least this many candidates. */
export const MIN_STACK_ABSOLUTE = 3;

/**
 * Cadence multiplier: require at least `postsPerDay × this` candidates.
 * Ensures roughly a two-day buffer before the queue would run dry at the
 * configured cadence.
 */
export const MIN_STACK_DAYS_BUFFER = 2;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface EnforceAllResult {
  /** Total cadence configs evaluated this run. */
  configs: number;
  /** Pairs where depth was at or above minimum. */
  ok: number;
  /** Pairs where depth was below minimum (a 'refill' signal was emitted). */
  deficits: number;
  /** Structured signal for each deficit, available for callers that need it. */
  signals: StockKeeperOutput[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DepthEnforcerService {
  private readonly logger = new Logger(DepthEnforcerService.name);

  constructor(private readonly _prisma: PrismaService) {}

  /**
   * Evaluate every active, non-paused cadence config.
   *
   * For each (org, platform) pair:
   *   1. Query the current PENDING stack depth.
   *   2. Compute minDepth from the cadence config.
   *   3. Call assessStock() to get a signal.
   *   4. Log a warning for 'refill' signals.
   *
   * Returns a summary and the full list of deficit signals.
   */
  async enforceAll(): Promise<EnforceAllResult> {
    const now = new Date();

    const configs = await this._prisma.apCadenceConfig.findMany({
      where: {
        active: true,
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
      },
    });

    const result: EnforceAllResult = {
      configs: configs.length,
      ok: 0,
      deficits: 0,
      signals: [],
    };

    for (const config of configs) {
      try {
        const currentDepth = await depth(
          this._prisma,
          config.organizationId,
          config.platform,
        );

        const minDepth = Math.max(
          MIN_STACK_ABSOLUTE,
          config.postsPerDay * MIN_STACK_DAYS_BUFFER,
        );

        const signal = assessStock({
          tenantId: config.organizationId,
          platform: config.platform,
          currentDepth,
          minDepth,
        });

        if (signal.action === 'refill') {
          result.deficits++;
          result.signals.push(signal);
          this.logger.warn(
            `Stack deficit — org=${config.organizationId} platform=${config.platform} ` +
              `depth=${currentDepth} min=${minDepth} deficit=${signal.deficit}` +
              ` — copywriter agent will be wired in Phase 3 (slice 3.2)`,
          );
        } else {
          result.ok++;
        }
      } catch (err) {
        this.logger.error(
          `Depth check failed — org=${config.organizationId} platform=${config.platform}: ${err}`,
        );
      }
    }

    if (result.deficits === 0 && configs.length > 0) {
      this.logger.debug(
        `Depth enforcement: all ${configs.length} pair(s) healthy`,
      );
    }

    return result;
  }
}
