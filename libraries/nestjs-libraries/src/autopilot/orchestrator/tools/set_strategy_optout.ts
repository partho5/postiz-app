/**
 * `set_strategy_optout` tool — slice 1.3.f
 *
 * Proposes an opt-in/opt-out change to the tenant's anonymized strategy-pattern
 * contribution setting (slice 4.6).  Routes through the confirm-before-apply
 * pipeline — never writes directly.
 *
 * Emits a `proposal` event; returns `emitted: true`.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { createProposal } from '../../chat/proposals';

const inputSchema = z.object({
  optedOut: z
    .boolean()
    .describe(
      'true to opt out of sharing anonymized strategy patterns; false to opt back in.',
    ),
  reason: z
    .string()
    .optional()
    .describe("Optional one-line reason the user gave (e.g. 'privacy concerns')."),
});

export type SetStrategyOptoutInput = z.infer<typeof inputSchema>;

export interface SetStrategyOptoutOutput {
  proposalId: string;
  optedOut: boolean;
}

export function createSetStrategyOptoutTool(): OrchestratorTool<
  SetStrategyOptoutInput,
  SetStrategyOptoutOutput
> {
  return {
    name: 'set_strategy_optout',
    description:
      "Propose an opt-out or opt-in change for anonymized strategy-pattern sharing. Creates a proposal the user must confirm. Use when the user says 'stop sharing my data', 'opt me out', 'I want to opt in', 'turn off data sharing', etc.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;
      const changes: Record<string, unknown> = { optedOut: input.optedOut };
      if (input.reason) changes.reason = input.reason;

      const rationale = input.optedOut
        ? `Opt out of sharing anonymized strategy patterns${input.reason ? ` (${input.reason})` : ''}.`
        : `Opt back in to sharing anonymized strategy patterns${input.reason ? ` (${input.reason})` : ''}.`;

      const proposalId = await createProposal(db, ctx.org.id, {
        targetEntity: 'tenant_strategy_optout',
        targetId: null,
        changes,
        rationale,
      });

      ctx.emit({
        type: 'proposal',
        proposalId,
        rationale,
        targetEntity: 'tenant_strategy_optout',
        changes,
      } as any);

      ctx.logger.info(
        `set_strategy_optout: proposal=${proposalId} optedOut=${input.optedOut} org=${ctx.org.id}`,
      );

      return {
        observation: `Strategy opt-${input.optedOut ? 'out' : 'in'} proposal created (id: ${proposalId}). Waiting for the user to confirm.`,
        data: { proposalId, optedOut: input.optedOut },
        emitted: true,
      };
    },
  };
}
