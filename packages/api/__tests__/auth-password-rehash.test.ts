import crypto from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  verifyPasswordWithRehash,
  HASH_VERSION,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  SCRYPT_KEYLEN,
} from '../src/services/auth.service';

function makeLegacyHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${h}`;
}

describe('password hash & verify (scrypt cost migration)', () => {
  const PWD = 'Sup3rSecret!Pass';

  it('new-format hash & verify roundtrip', () => {
    const stored = hashPassword(PWD);
    expect(stored.startsWith(`${HASH_VERSION}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:`)).toBe(true);
    expect(verifyPassword(PWD, stored)).toBe(true);
  });

  it('legacy-format (salt:hash, default scrypt) verifies successfully', () => {
    const legacy = makeLegacyHash(PWD);
    expect(verifyPassword(PWD, legacy)).toBe(true);
  });

  it('wrong password against new format → invalid + no rehash', () => {
    const stored = hashPassword(PWD);
    const r = verifyPasswordWithRehash('wrong', stored);
    expect(r.valid).toBe(false);
    expect(r.needsRehash).toBe(false);
  });

  it('wrong password against legacy format → invalid + no rehash', () => {
    const legacy = makeLegacyHash(PWD);
    const r = verifyPasswordWithRehash('wrong', legacy);
    expect(r.valid).toBe(false);
    expect(r.needsRehash).toBe(false);
  });

  it('legacy success → needsRehash true', () => {
    const legacy = makeLegacyHash(PWD);
    const r = verifyPasswordWithRehash(PWD, legacy);
    expect(r.valid).toBe(true);
    expect(r.needsRehash).toBe(true);
  });

  it('new format with current params → needsRehash false', () => {
    const stored = hashPassword(PWD);
    const r = verifyPasswordWithRehash(PWD, stored);
    expect(r.valid).toBe(true);
    expect(r.needsRehash).toBe(false);
  });

  it('new format with weaker params (N=16384) → needsRehash true', () => {
    const weakN = 16384;
    const salt = crypto.randomBytes(16).toString('hex');
    const h = crypto.scryptSync(PWD, salt, SCRYPT_KEYLEN, { N: weakN, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 }).toString('hex');
    const stored = `${HASH_VERSION}:${weakN}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${h}`;
    const r = verifyPasswordWithRehash(PWD, stored);
    expect(r.valid).toBe(true);
    expect(r.needsRehash).toBe(true);
  });

  it('corrupted hash with mismatched length does not throw', () => {
    const stored = `${HASH_VERSION}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:abcdef:deadbeef`;
    expect(() => verifyPasswordWithRehash(PWD, stored)).not.toThrow();
    const r = verifyPasswordWithRehash(PWD, stored);
    expect(r.valid).toBe(false);
  });

  it('malformed stored value (1 part) returns invalid', () => {
    const r = verifyPasswordWithRehash(PWD, 'garbage');
    expect(r.valid).toBe(false);
    expect(r.needsRehash).toBe(false);
  });
});
