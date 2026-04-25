/**
 * `resume_posting` tool — resume one or many paused platforms in one call
 *
 * `platforms` is an array — pass specific slugs or omit to resume all
 * currently-paused platforms. A single resume is platforms:["twitter"].
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';
import type { CadenceConfigService } from '../../stack/cadence-config.service';

const inputSchema = z.object({
  platforms: z
    .array(z.string())
    .optional()
    .describe(
      'Platform slugs to resume (e.g. ["twitter","linkedin"]). Omit to resume ALL currently-paused platforms.',
    ),
});

export type ResumePostingInput = z.infer<typeof inputSchema>;

export interface ResumePostingOutput {
  resumedPlatforms: string[];
}

export interface ResumePostingDeps {
  cadenceConfig: Pick<CadenceConfigService, 'resume'>;
}

export function createResumePostingTool(
  deps: ResumePostingDeps,
): OrchestratorTool<ResumePostingInput, ResumePostingOutput> {
  return {
    name: 'resume_posting',
    description:
      'Resume autopilot posting for specific platforms or all paused platforms. Pass platforms:["twitter"] for one, or omit to resume everything paused. Examples: "resume posting", "unpause Twitter", "start posting again".',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      let platforms: string[];

      if (input.platforms?.length) {
        platforms = input.platforms;
      } else {
        const configs = await ctx.db.apCadenceConfig.findMany({
          where: { organizationId: ctx.org.id, active: true, pausedUntil: { gt: ctx.now } },
          select: { platform: true },
        });
        platforms = configs.map((c) => c.platform);
        if (platforms.length === 0) {
          return {
            observation: 'No platforms are currently paused — nothing to resume.',
            data: { resumedPlatforms: [] },
          };
        }
      }

      for (const platform of platforms) {
        await deps.cadenceConfig.resume(ctx.org.id, platform);
      }

      const platformList = platforms.join(', ');
      const message = platforms.length === 1
        ? `Resumed posting for ${platforms[0]}.`
        : `Resumed posting for ${platformList}.`;

      ctx.emit({ type: 'action_result', action: 'resume_posting', ok: true, message });
      ctx.logger.info(`resume_posting: platforms=[${platformList}]`);

      return {
        observation: message,
        data: { resumedPlatforms: platforms },
        emitted: true,
      };
    },
  };
}
