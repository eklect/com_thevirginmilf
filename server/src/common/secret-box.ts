import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Symmetric encryption for secrets held at rest.
 *
 * Two things use it: MAP's access and refresh tokens sitting in `auth_sessions`,
 * and the in-flight OAuth transaction (state + PKCE verifier) that rides in a
 * cookie between `/auth/login` and `/auth/callback`.
 *
 * AES-256-GCM, so tampering is detected rather than silently decrypting to
 * garbage — which matters most for the cookie, where the ciphertext spends its
 * life in someone else's browser. The key is derived from
 * `SESSION_ENCRYPTION_SECRET` with scrypt, letting that value be a human-managed
 * passphrase instead of exactly 32 raw bytes.
 *
 * Format: `v1.<salt>.<iv>.<authTag>.<ciphertext>`, all base64url. The version
 * prefix exists so a future scheme can be introduced without guessing at old
 * rows.
 *
 * This is a deliberate port of MAP's `src/common/secret-box.ts`. The two are
 * independent — they hold different secrets under different keys — but keeping
 * the format identical means one thing to reason about rather than two.
 */
const VERSION = 'v1';
const KEY_LENGTH = 32;
const IV_LENGTH = 12; // 96 bits, the GCM standard
const SALT_LENGTH = 16;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LENGTH);
}

export function seal(plaintext: string, secret: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION,
    salt.toString('base64url'),
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function open(sealed: string, secret: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error('Malformed sealed value');
  }

  const [, saltB64, ivB64, tagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret, Buffer.from(saltB64, 'base64url')),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
