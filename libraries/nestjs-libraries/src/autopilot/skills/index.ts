export * from './types';
export * from './rewrite_for_platform';
export * from './analytics_snapshot';
export * from './rollback_post';
import type { SkillRegistry } from './types';
import { rewriteForPlatformSkill } from './rewrite_for_platform';
import { analyticsSnapshotSkill } from './analytics_snapshot';
import { rollbackPostSkill } from './rollback_post';

/**
 * Central skill registry.
 * Import skills are added here as they are implemented (slice 0.5+).
 * An empty registry is valid — callers check for key existence before invoking.
 */
export const SKILL_REGISTRY: SkillRegistry = {
  [rewriteForPlatformSkill.id]: rewriteForPlatformSkill,
  [analyticsSnapshotSkill.id]: analyticsSnapshotSkill,
  [rollbackPostSkill.id]: rollbackPostSkill,
};
