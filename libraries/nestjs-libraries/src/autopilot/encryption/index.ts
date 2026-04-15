import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm' as const;
const IV_BYTES = 12;  // 96-bit IV — recommended for GCM
const TAG_BYTES = 16; // 128-bit auth tag (GCM default)

/**
 * Reads AP_ENCRYPTION_KEY from env and returns it as a 32-byte Buffer.
 * Throws if missing or wrong length — encryption must never silently degrade.
 */
function getKey(): Buffer {
  const raw = process.env.AP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      '[autopilot] AP_ENCRYPTION_KEY is not set. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `[autopilot] AP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        'Regenerate with the command above.'
    );
  }
  return key;
}

/**
 * Encrypts a UTF-8 plaintext string using AES-256-GCM with a random IV.
 *
 * Output format (base64): IV (12 bytes) || Auth Tag (16 bytes) || Ciphertext
 *
 * The auth tag ensures tampering is detected on decryption.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString('base64');
}

/**
 * Decrypts a base64 string produced by `encrypt`.
 *
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch),
 * if it is too short to be valid, or if AP_ENCRYPTION_KEY is wrong/missing.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('[autopilot] decrypt: ciphertext is too short to be valid');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
