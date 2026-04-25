/**
 * `update_business_profile` tool — slice 1.3.f
 *
 * Creates a proposal for the tenant's business profile via the existing
 * confirm-before-apply pipeline (slice 1.4).  Never writes directly —
 * profile changes require explicit user confirmation.
 *
 * Emits a `proposal` SSE event so the frontend renders the confirm card
 * immediately; returns `emitted: true` to suppress the orchestrator's
 * plain-text echo.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { createProposal } from '../../chat/proposals';

const inputSchema = z.object({
  changes: z
    .record(z.unknown())
    .describe(
      'Fields to update on the business profile. Recognised keys: niche, goals, brandVoiceShort, brandVoiceExtended, antiPatterns, regulatoryFlags.',
    ),
  rationale: z
    .string()
    .min(1)
    .describe('One-sentence explanation of what is changing and why.'),
});

export type UpdateBusinessProfileInput = z.infer<typeof inputSchema>;

export interface UpdateBusinessProfileOutput {
  proposalId: string;
}

export function createUpdateBusinessProfileTool(): OrchestratorTool<
  UpdateBusinessProfileInput,
  UpdateBusinessProfileOutput
> {
  return {
    name: 'update_business_profile',
    description:
      "Propose an update to the tenant's business profile (niche, brand voice, goals, anti-patterns, regulatory flags). Creates a proposal the user must confirm — never writes directly. Use when the user says 'change my niche to X', 'update my brand voice', 'I\\'m targeting the Y market', 'remove anti-pattern Z', etc.",
    parameters: inputSchema,
    handler: async (ctx, input) => {
      const db = ctx.db as unknown as PrismaClient;
      const proposalId = await createProposal(db, ctx.org.id, {
        targetEntity: 'business_profile',
        targetId: null,
        changes: input.changes,
        rationale: input.rationale,
      });

      ctx.emit({
        type: 'proposal',
        proposalId,
        rationale: input.rationale,
        targetEntity: 'business_profile',
        changes: input.changes,
      } as any);

      ctx.logger.info(
        `update_business_profile: proposal=${proposalId} org=${ctx.org.id} keys=${Object.keys(input.changes).join(',')}`,
      );

      return {
        observation: `Profile-change proposal created (id: ${proposalId}). Waiting for the user to confirm.`,
        data: { proposalId },
        emitted: true,
      };
    },
  };
}
