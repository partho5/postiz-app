/**
 * `get_profile` tool — slice 1.3.f
 *
 * Returns the tenant's current business profile and active growth rules as
 * a structured observation the LLM can relay to the user.  Pure DB read —
 * no LLM call, no side-effects.
 *
 * Use when the user asks: "what's my current profile?", "what niche am I in?",
 * "show my growth rules", etc.
 */

import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { OrchestratorTool } from '../types';
import { getStructuredProfile, type StructuredProfile } from '../../memory';

const inputSchema = z.object({}).describe('No parameters — returns the full tenant profile.');

export type GetProfileInput = z.infer<typeof inputSchema>;

export interface GetProfileOutput {
  hasProfile: boolean;
  profile: StructuredProfile;
}

export function createGetProfileTool(): OrchestratorTool<GetProfileInput, GetProfileOutput> {
  return {
    name: 'get_profile',
    description:
      'Return the tenant\'s current business profile: niche, goals, brand voice, anti-patterns, regulatory flags, and active growth rules. Use for "what\'s my profile?", "what niche am I in?", "show my setup".',
    parameters: inputSchema,
    handler: async (ctx, _input) => {
      const db = ctx.db as unknown as PrismaClient;
      const profile = await getStructuredProfile(db, ctx.org.id);

      const hasProfile = profile.businessProfile !== null;

      let observation: string;
      if (!hasProfile) {
        observation =
          'No business profile set yet. The user should complete onboarding first.';
      } else {
        const bp = profile.businessProfile!;
        const lines: string[] = [
          `Niche: ${bp.niche || '(not set)'}`,
          `Brand voice (short): ${bp.brandVoiceShort || '(not set)'}`,
          `Goals: ${JSON.stringify(bp.goals)}`,
          `Anti-patterns: ${JSON.stringify(bp.antiPatterns)}`,
          `Regulatory flags: ${JSON.stringify(bp.regulatoryFlags)}`,
          `Growth rules (${profile.growthRules.length}): ${
            profile.growthRules.length === 0
              ? 'none'
              : profile.growthRules
                  .map((r) => `${r.ruleKey}=${JSON.stringify(r.ruleValue)}`)
                  .join('; ')
          }`,
        ];
        observation = `Current profile:\n${lines.join('\n')}`;
      }

      ctx.logger.info(`get_profile: org=${ctx.org.id} hasProfile=${hasProfile}`);

      return {
        observation,
        data: { hasProfile, profile },
      };
    },
  };
}
