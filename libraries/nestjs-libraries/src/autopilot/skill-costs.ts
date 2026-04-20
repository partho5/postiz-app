// ---------------------------------------------------------------------------
// Skill credit cost registry — dev-editable, integer costs only.
// Each skill declares how many credits it costs to invoke.
// Populated as skills are implemented; empty until then.
// ---------------------------------------------------------------------------

import type { SkillId } from '@gitroom/autopilot/skills';

/**
 * Integer credit cost per skill.
 * Use Partial<Record<...>> so only registered skills need entries —
 * unknown skills fall through to the 0-default in getSkillCost().
 */
const SKILL_COSTS: Partial<Record<SkillId, number>> = {
  rewrite_for_platform: 3,
  research_topic: 2,
  research_competitor: 5,
  analytics_snapshot: 1,
  rollback_post: 2,
};

/**
 * Returns the declared integer credit cost for a skill.
 * Returns 0 and logs a warning when no cost is registered.
 * Callers should treat 0 as "free" but note it may indicate a missing entry.
 */
export function getSkillCost(skillId: SkillId): number {
  if (!(skillId in SKILL_COSTS)) {
    console.warn(
      `[autopilot] skill-costs: no cost registered for skill "${skillId}", defaulting to 0`
    );
    return 0;
  }
  return SKILL_COSTS[skillId] ?? 0;
}

export { SKILL_COSTS };
