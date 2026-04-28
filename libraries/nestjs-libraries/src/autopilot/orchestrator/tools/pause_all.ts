/**
 * `pause_all` tool — slice E.2
 *
 * Pauses autopilot posting across ALL active platforms — vacation / holiday mode.
 * Ergonomic alias for pause_posting with no platform filter. Use when the user
 * says "going on vacation", "pause everything for a week", "take a break".
 * For pausing specific platforms, use pause_posting instead.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { parseTimeExpression } from '../../time/parse';
import type { CadenceConfigService } from '../../stack/cadence-config.service';

const DEFAULT_PAUSE_DAYS = 7;

const inputSchema = z.object({
  durationDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Days to pause for. Mutually exclusive with `until`. Defaults to 7.'),
  until: z
    .string()
    .optional()
    .describe('Natural-language or ISO 8601 end time (e.g. "next Monday", "2026-05-10"). Mutually exclusive with `durationDays`.'),
});

export type PauseAllInput = z.infer<typeof inputSchema>;

export interface PauseAllOutput {
  pausedPlatforms: string[];
  pausedUntil: string;
}

export interface PauseAllDeps {
  cadenceConfig: Pick<CadenceConfigService, 'pause'>;
}

export function createPauseAllTool(
  deps: PauseAllDeps,
): OrchestratorTool<PauseAllInput, PauseAllOutput> {
  return {
    name: 'pause_all',
    description:
      'Pause autopilot posting on ALL platforms at once — vacation / holiday mode. Use when the user wants to stop everything ("going on vacation", "pause everything for a week"). To pause specific platforms only, use pause_posting instead.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      let until: Date;

      if (input.until) {
        const parsed = parseTimeExpression(input.until, {
          now: ctx.now,
          timezone: ctx.timezone,
          forwardOnly: true,
        });
        if (!parsed || parsed.isPast) {
          return {
            observation: `Could not understand the time "${input.until}". Ask the user to clarify.`,
            data: { pausedPlatforms: [], pausedUntil: '' },
          };
        }
        until = parsed.date;
      } else {
        until = new Date(
          ctx.now.getTime() + (input.durationDays ?? DEFAULT_PAUSE_DAYS) * 24 * 60 * 60_000,
        );
      }

      const configs = await ctx.db.apCadenceConfig.findMany({
        where: { organizationId: ctx.org.id, active: true },
        select: { platform: true },
      });

      const platforms = configs.map((c) => c.platform);

      if (platforms.length === 0) {
        return {
          observation: 'No active cadence configs found — nothing to pause.',
          data: { pausedPlatforms: [], pausedUntil: until.toISOString() },
        };
      }

      for (const platform of platforms) {
        await deps.cadenceConfig.pause(ctx.org.id, platform, until);
      }

      const untilIso = until.toISOString();
      const message = `Paused all posting (${platforms.join(', ')}) until ${untilIso}.`;

      ctx.emit({ type: 'action_result', action: 'pause_all', ok: true, message });
      ctx.logger.info(`pause_all: org=${ctx.org.id} platforms=[${platforms.join(',')}] until=${untilIso}`);

      return {
        observation: message,
        data: { pausedPlatforms: platforms, pausedUntil: untilIso },
        emitted: true,
      };
    },
  };
}
