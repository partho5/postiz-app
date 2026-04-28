/**
 * `set_timezone` tool
 *
 * Saves the user's preferred IANA timezone to the Organization record.
 * All subsequent time expressions ("11 am", "next Monday 3pm") are
 * interpreted in this timezone — no conversion needed from the user.
 *
 * The LLM must convert any user expression to a valid IANA name before
 * calling (e.g. "Bangladesh" → "Asia/Dhaka", "EST" → "America/New_York").
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  timezone: z
    .string()
    .describe(
      'Valid IANA timezone name (e.g. "Asia/Dhaka", "America/New_York", "Europe/London"). ' +
      'Convert user expressions before calling: "GMT+6" → "Asia/Dhaka", ' +
      '"Bangladesh"/"Dhaka" → "Asia/Dhaka", "EST"/"Eastern"/"New York" → "America/New_York", ' +
      '"Pakistan"/"Karachi" → "Asia/Karachi", "India"/"IST" → "Asia/Kolkata", ' +
      '"London"/"UK"/"GMT"/"BST" → "Europe/London", "Berlin"/"CET" → "Europe/Berlin", ' +
      '"Dubai"/"UAE"/"GST" → "Asia/Dubai", "Singapore"/"SGT" → "Asia/Singapore".',
    ),
});

export type SetTimezoneInput = z.infer<typeof inputSchema>;

export interface SetTimezoneOutput {
  timezone: string;
}

export function createSetTimezoneTool(): OrchestratorTool<SetTimezoneInput, SetTimezoneOutput> {
  return {
    name: 'set_timezone',
    description:
      'Save the user\'s preferred timezone so all times are interpreted correctly. ' +
      'Call this whenever the user mentions their location, timezone, or time offset — ' +
      'examples: "I\'m in Bangladesh", "I\'m in GMT+6", "my timezone is EST", ' +
      '"I\'m based in London", "use Dhaka time", "I\'m in New York", ' +
      '"set timezone to PST", "I\'m in the UAE", "IST please", "I live in Berlin". ' +
      'Convert the expression to a valid IANA name (see parameter description) then call immediately — do NOT ask for confirmation.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
      } catch {
        return {
          observation: `"${input.timezone}" is not a valid IANA timezone. Ask the user to clarify.`,
          data: { timezone: input.timezone },
        };
      }

      const db = ctx.db as unknown as PrismaClient;
      await db.organization.update({
        where: { id: ctx.org.id },
        data: { timezone: input.timezone },
      });

      ctx.logger.info(`set_timezone: org=${ctx.org.id} timezone=${input.timezone}`);

      ctx.emit({
        type: 'text',
        chunk: `Timezone set to ${input.timezone}. All times you mention will now be treated as ${input.timezone}.`,
      } as any);

      return {
        observation: `Timezone saved as "${input.timezone}". Confirm briefly to the user if you haven't already emitted a text event.`,
        data: { timezone: input.timezone },
        emitted: true,
      };
    },
  };
}
