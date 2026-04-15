import type { SkillId, SkillContext } from '@gitroom/autopilot/skills';

// ---------------------------------------------------------------------------
// AgentId
// ---------------------------------------------------------------------------

export type AgentId = string;

// ---------------------------------------------------------------------------
// AgentContext
// ---------------------------------------------------------------------------

/**
 * Runtime context injected into every agent run.
 * Currently identical to SkillContext — extended here so future fields
 * (e.g. dispatch helper, plan reference) can be added without touching SkillContext.
 */
export type AgentContext = SkillContext;

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

/**
 * Shape every sub-agent must satisfy.
 * One file per agent; each file default-exports an AgentDefinition.
 *
 * - `allowedSkills` declares which skills this agent may invoke (enforced by the
 *   pre-flight pipeline in slice 0.13; ignored here).
 * - `run` is the agent's entry point. Input/Output are generic so each agent
 *   can be strongly typed at its own file level.
 */
export interface AgentDefinition<Input = unknown, Output = unknown> {
  id: AgentId;
  systemPrompt: string;
  allowedSkills: SkillId[];
  run(ctx: AgentContext, input: Input): Promise<Output>;
}

// ---------------------------------------------------------------------------
// Compile-time smoke check
// A minimal stub must fully satisfy AgentDefinition — if this fails to
// compile, the types are broken.
// ---------------------------------------------------------------------------

const _stub: AgentDefinition = {
  id: 'stub',
  systemPrompt: 'You are a stub agent.',
  allowedSkills: [],
  run: async (_ctx, _input) => undefined,
};

void _stub;
