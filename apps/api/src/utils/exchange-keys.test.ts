import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetKeyCache, decryptSecret, encryptSecret } from './exchange-keys';

const KEY_32 = 'a'.repeat(64); // 32 bytes hex
const SECRET = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const prev = process.env.EXCHANGE_KEY_ENCRYPTION_SECRET;

beforeEach(() => {
  process.env.EXCHANGE_KEY_ENCRYPTION_SECRET = KEY_32;
  _resetKeyCache();
});
afterEach(() => {
  process.env.EXCHANGE_KEY_ENCRYPTION_SECRET = prev;
  _resetKeyCache();
});

describe('exchange-keys (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(encryptSecret(SECRET))).toBe(SECRET);
  });

  it('produces a fresh IV each time (different ciphertext, same plaintext)', () => {
    const a = encryptSecret(SECRET);
    const b = encryptSecret(SECRET);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('emits iv:tag:ciphertext (three hex parts)', () => {
    const parts = encryptSecret(SECRET).split(':');
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => /^[0-9a-f]+$/.test(p))).toBe(true);
  });

  it('detects tampering (GCM auth tag)', () => {
    const blob = encryptSecret(SECRET);
    const [iv, tag, data] = blob.split(':');
    const flipped = data.slice(0, -1) + (data.endsWith('0') ? '1' : '0');
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it('fails to decrypt with a different master key', () => {
    const blob = encryptSecret(SECRET);
    process.env.EXCHANGE_KEY_ENCRYPTION_SECRET = 'b'.repeat(64);
    _resetKeyCache();
    expect(() => decryptSecret(blob)).toThrow();
  });

  it('rejects a wrong-length master key', () => {
    process.env.EXCHANGE_KEY_ENCRYPTION_SECRET = 'abcd';
    _resetKeyCache();
    expect(() => encryptSecret(SECRET)).toThrow(/32 bytes/);
  });

  it('rejects a malformed blob', () => {
    expect(() => decryptSecret('not-a-valid-blob')).toThrow(/format/);
  });
});
