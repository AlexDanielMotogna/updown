/**
 * AES-256-GCM encryption for exchange agent-wallet private keys.
 *
 * The master key comes from `EXCHANGE_KEY_ENCRYPTION_SECRET` (32-byte hex, i.e.
 * 64 hex chars). Agent private keys are encrypted before being stored in
 * `ExchangeConnection.encryptedKeyData` and only decrypted in-memory at sign
 * time. The master key never signs anything — it only wraps the agent keys
 * (see the "3 pieces" model in docs/Terminal-Migration/ADR-003).
 *
 * Format: `iv:authTag:ciphertext`, all hex. GCM gives us authenticated
 * encryption, so tampering/wrong-key is detected on decrypt.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // standard GCM nonce length
const KEY_BYTES = 32; // AES-256

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.EXCHANGE_KEY_ENCRYPTION_SECRET;
  if (!hex) {
    throw new Error('EXCHANGE_KEY_ENCRYPTION_SECRET is not set');
  }
  const key = Buffer.from(hex.trim(), 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `EXCHANGE_KEY_ENCRYPTION_SECRET must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${key.length} bytes`
    );
  }
  cachedKey = key;
  return key;
}

/** Encrypt a plaintext secret (e.g. an agent private key) → `iv:tag:ciphertext` hex. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Decrypt an `iv:tag:ciphertext` blob produced by {@link encryptSecret}. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted blob format (expected iv:tag:ciphertext)');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Reset the cached master key (tests that mutate the env var). */
export function _resetKeyCache(): void {
  cachedKey = null;
}
