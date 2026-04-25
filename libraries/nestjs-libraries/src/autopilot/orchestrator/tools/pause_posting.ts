/**
 * `pause_posting` tool — pause one or many platforms in one call
 *
 * `platforms` is an array — pass specific slugs or omit to pause all active
 * platforms. A single pause is platforms:["twitter"] — same code path.
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import { parseTimeExpression } from '../../time/parse';
import type { CadenceConfigService } from '../../stack/cadence-config.service';

const DEFAULT_PAUSE_DAYS = 7;

const inputSchema = z.object({
  platforms: z
    .array(z.string())
    .optional()
    .describe(
      'Platform slugs to pause (e.g. ["twitter","linkedin"]). Omit to pause ALL active platforms.',
    ),
  durationDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('How many days to pause for. Mutually exclusive with `until`. Defaults to 7.'),
  until: z
    .string()
    .optional()
    .describe('Natural-language or ISO 8601 end time (e.g. "next Monday"). Mutually exclusive with `durationDays`.'),
});

export type PausePostingInput = z.infer<typeof inputSchema>;

export interface PausePostingOutput {
  pausedPlatforms: string[];
  pausedUntil: string;
}

export interface PausePostingDeps {
  cadenceConfig: Pick<CadenceConfigService, 'pause'>;
}

export function createPausePostingTool(
  deps: PausePostingDeps,
): OrchestratorTool<PausePostingInput, PausePostingOutput> {
  return {
    name: 'pause_posting',
    description:
      'Pause autopilot posting for specific platforms or all platforms. Pass platforms:["twitter","linkedin"] for specific ones, or omit platforms to pause all. Examples: "pause Twitter for a week", "stop all posting for 3 days", "pause LinkedIn until next Monday".',
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
        until = new Date(ctx.now.getTime() + (input.durationDays ?? DEFAULT_PAUSE_DAYS) * 24 * 60 * 60_000);
      }

      let platforms: string[];
      if (input.platforms?.length) {
        platforms = input.platforms;
      } else {
        const configs = await ctx.db.apCadenceConfig.findMany({
          where: { organizationId: ctx.org.id, active: true },
          select: { platform: true },
        });
        platforms = configs.map((c) => c.platform);
        if (platforms.length === 0) {
          return {
            observation: 'No active cadence configs found — nothing to pause.',
            data: { pausedPlatforms: [], pausedUntil: until.toISOString() },
          };
        }
      }

      for (const platform of platforms) {
        await deps.cadenceConfig.pause(ctx.org.id, platform, until);
      }

      const untilIso = until.toISOString();
      const platformList = platforms.join(', ');
      const message = platforms.length === 1
        ? `Paused ${platforms[0]} posting until ${untilIso}.`
        : `Paused posting for ${platformList} until ${untilIso}.`;

      ctx.emit({ type: 'action_result', action: 'pause_posting', ok: true, message });
      ctx.logger.info(`pause_posting: platforms=[${platformList}] until=${untilIso}`);

      return {
        observation: message,
        data: { pausedPlatforms: platforms, pausedUntil: untilIso },
        emitted: true,
      };
    },
  };
}
