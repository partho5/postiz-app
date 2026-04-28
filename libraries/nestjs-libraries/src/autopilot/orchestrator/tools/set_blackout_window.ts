/**
 * `set_blackout_window` tool — slice E.2
 *
 * Creates a blackout window: a time range during which posts must never go out
 * (e.g. "never post between 10pm and 7am"). Stored in ApBlackoutWindow.
 * Note: the slot scheduler does not yet enforce these windows — enforcement
 * is wired in a future slice.
 *
 * Hours use 24-hour format (0–23). A window can cross midnight (e.g. start=22, end=7).
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  startHour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .describe('Hour to start the blackout (0–23, 24-hour clock). E.g. 22 = 10pm.'),
  endHour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .describe('Hour to end the blackout (0–23, 24-hour clock). E.g. 7 = 7am.'),
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone for this window (e.g. "America/New_York"). Defaults to the org timezone.'),
  label: z
    .string()
    .optional()
    .describe('Human-readable label (e.g. "overnight", "lunch break").'),
});

export type SetBlackoutWindowInput = z.infer<typeof inputSchema>;

export interface SetBlackoutWindowOutput {
  id: string;
  startHour: number;
  endHour: number;
  timezone: string;
  label?: string;
}

export function createSetBlackoutWindowTool(): OrchestratorTool<
  SetBlackoutWindowInput,
  SetBlackoutWindowOutput
> {
  return {
    name: 'set_blackout_window',
    description:
      'Create a blackout window — a daily time range when posts must never go out (e.g. "never post between 10pm and 7am", "no posts during lunch 12–13"). Hours are 0–23. Windows can cross midnight.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const timezone = input.timezone ?? ctx.timezone;

      const row = await ctx.db.apBlackoutWindow.create({
        data: {
          organizationId: ctx.org.id,
          startHour: input.startHour,
          endHour: input.endHour,
          timezone,
          label: input.label ?? null,
          active: true,
        },
      });

      const rangeDesc =
        input.startHour > input.endHour
          ? `${input.startHour}:00–${input.endHour}:00 (crosses midnight)`
          : `${input.startHour}:00–${input.endHour}:00`;

      const labelNote = input.label ? ` (${input.label})` : '';
      const message = `Blackout window set: no posts between ${rangeDesc} ${timezone}${labelNote}.`;

      ctx.emit({ type: 'action_result', action: 'set_blackout_window', ok: true, message });
      ctx.logger.info(
        `set_blackout_window: org=${ctx.org.id} start=${input.startHour} end=${input.endHour} tz=${timezone}`,
      );

      return {
        observation: message,
        data: { id: row.id, startHour: row.startHour, endHour: row.endHour, timezone: row.timezone, label: row.label ?? undefined },
        emitted: true,
      };
    },
  };
}
