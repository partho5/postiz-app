/**
 * Image generation abstraction — provider-agnostic interface.
 *
 * All callers use generateImage() and isImageGenAvailable() only.
 * The concrete provider is plugged in by replacing the stub body in
 * generateImage().  Nothing outside this file needs to change when a
 * provider is added.
 *
 * Key storage: ap_platform_key with platform = IMAGE_GEN_KEY_PLATFORM.
 *   secretEncrypted = encrypted API key
 *   meta = { provider?: string, modelId?: string }
 *
 * To add a provider:
 *   1. Set the key via setImageGenKey().
 *   2. Replace the TODO block in generateImage() with the provider call.
 *   3. The function must return a publicly accessible URL string.
 */

import { PrismaClient } from '@prisma/client';
import * as platformKeys from '../platform_keys';

export const IMAGE_GEN_KEY_PLATFORM = 'image_gen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenOptions {
  aspectRatio?: '1:1' | '16:9' | '9:16';
}

export class ImageGenNotConfiguredError extends Error {
  constructor() {
    super(
      'Image generation is not set up yet. ' +
      'Configure it by saying: "Set my image generation API key to <your-key>"',
    );
    this.name = 'ImageGenNotConfiguredError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the tenant has stored an image generation API key.
 * Use this before asking the user whether they want an image generated.
 */
export async function isImageGenAvailable(
  db: PrismaClient,
  tenantId: string,
): Promise<boolean> {
  const key = await platformKeys.get(db, tenantId, IMAGE_GEN_KEY_PLATFORM);
  return key !== null;
}

/**
 * Store an image generation API key for a tenant.
 * meta.provider / meta.modelId are optional hints consumed by the provider.
 */
export async function setImageGenKey(
  db: PrismaClient,
  tenantId: string,
  apiKey: string,
  meta: { provider?: string; modelId?: string } = {},
): Promise<void> {
  await platformKeys.set(db, tenantId, IMAGE_GEN_KEY_PLATFORM, apiKey, meta);
}

/**
 * Generate an image for the given prompt and return its public URL.
 *
 * Throws ImageGenNotConfiguredError when no API key is stored.
 *
 * ── Provider stub ─────────────────────────────────────────────────────────
 * Replace the TODO block below with the real provider call.
 *
 * Pattern:
 *   import { decrypt } from '../encryption';
 *   const row = await db.apPlatformKey.findUnique({
 *     where: { organizationId_platform: { organizationId: tenantId, platform: IMAGE_GEN_KEY_PLATFORM } },
 *     select: { secretEncrypted: true, meta: true },
 *   });
 *   const apiKey = decrypt(row.secretEncrypted);
 *   const meta = row.meta as { provider?: string; modelId?: string };
 *   // call provider → return URL string
 * ──────────────────────────────────────────────────────────────────────────
 */
export async function generateImage(
  db: PrismaClient,
  tenantId: string,
  _prompt: string,
  _options?: ImageGenOptions,
): Promise<string> {
  const available = await isImageGenAvailable(db, tenantId);
  if (!available) throw new ImageGenNotConfiguredError();

  // TODO: replace with concrete provider implementation.
  throw new ImageGenNotConfiguredError();
}
