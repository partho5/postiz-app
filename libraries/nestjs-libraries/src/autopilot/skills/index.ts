export * from './types';
import type { SkillRegistry } from './types';

/**
 * Central skill registry.
 * Import skills are added here as they are implemented (slice 0.5+).
 * An empty registry is valid — callers check for key existence before invoking.
 */
export const SKILL_REGISTRY: SkillRegistry = {};
