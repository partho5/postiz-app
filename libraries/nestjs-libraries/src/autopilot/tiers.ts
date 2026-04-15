// ---------------------------------------------------------------------------
// Tier definitions — dev-editable, type-safe.
// Source of truth for what each plan includes.
// Add Starter / Pro tiers in a later slice; only Free is needed for MVP.
// ---------------------------------------------------------------------------

export type TierId = string;

/**
 * Binary feature flags that are either fully included in a tier or not.
 * Everything else (volume, frequency) is credit-gated.
 */
export type HardFeature =
  | 'extension'           // browser automation extension pairing
  | 'article_ingestion'   // ingest external articles as content source
  | 'apify_basic'         // Apify-backed research (basic quota)
  | 'apify_deep_research' // Apify deep research (Pro only)
  | 'video_generation';   // reserved for Pro when implemented

export interface TierLimits {
  /** Max posts queued per platform per calendar month. */
  posts_per_platform_per_month: number;
  /** Minimum stack depth the system maintains (never publishes below this). */
  stack_depth_min: number;
}

export interface TierDefinition {
  id: TierId;
  name: string;
  /** One-time credit grant on first activation. 0 = no one-time grant. */
  one_time_credits: number;
  /** Credits refreshed at the start of each billing period. 0 = no renewal. */
  monthly_credits: number;
  /** Price in USD cents per month (0 = free). */
  price_monthly: number;
  /** Price in USD cents per year (0 = free). */
  price_yearly: number;
  /** Binary feature unlocks included in this tier. */
  hard_features: HardFeature[];
  default_limits: TierLimits;
}

/**
 * Central tier registry.
 * Keyed by TierId — used by billing, credit gates, and upgrade prompts.
 */
export const TIERS: Record<TierId, TierDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    one_time_credits: 500,   // real grant so users experience the product's power
    monthly_credits: 0,
    price_monthly: 0,
    price_yearly: 0,
    hard_features: ['extension'],
    default_limits: {
      posts_per_platform_per_month: 30,
      stack_depth_min: 5,
    },
  },
  // Starter and Pro tiers added in a later slice (slice 0.4 scope = Free only).
};
