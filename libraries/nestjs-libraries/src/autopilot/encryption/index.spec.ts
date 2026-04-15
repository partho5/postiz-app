import { randomBytes } from 'crypto';
import { encrypt, decrypt } from './index';

// Provide a fresh test key before each test so the module has a valid env var.
beforeEach(() => {
  process.env.AP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

afterEach(() => {
  delete process.env.AP_ENCRYPTION_KEY;
});

describe('encrypt / decrypt', () => {
  it('round-trip: decrypt(encrypt(x)) === x for arbitrary UTF-8 input', () => {
    const inputs = [
      'simple ascii',
      'unicode 🔐 emoji',
      'a'.repeat(10_000), // large payload
      '',                  // empty string edge case
    ];
    for (const plaintext of inputs) {
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    }
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
  });

  it('throws when a tampered ciphertext is decrypted', () => {
    const ciphertext = encrypt('sensitive data');
    const buf = Buffer.from(ciphertext, 'base64');
    // Flip a byte in the ciphertext body (after the 12-byte IV + 16-byte tag).
    buf[12 + 16] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });

  it('throws when the auth tag is tampered', () => {
    const ciphertext = encrypt('sensitive data');
    const buf = Buffer.from(ciphertext, 'base64');
    // Corrupt the auth tag region (bytes 12–27).
    buf[12] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });

  it('throws when AP_ENCRYPTION_KEY is not set', () => {
    delete process.env.AP_ENCRYPTION_KEY;
    expect(() => encrypt('anything')).toThrow(/AP_ENCRYPTION_KEY/);
    expect(() => decrypt('anything')).toThrow(/AP_ENCRYPTION_KEY/);
  });

  it('throws when AP_ENCRYPTION_KEY is the wrong length', () => {
    process.env.AP_ENCRYPTION_KEY = randomBytes(16).toString('base64'); // 16 bytes, not 32
    expect(() => encrypt('anything')).toThrow(/32 bytes/);
  });
});
