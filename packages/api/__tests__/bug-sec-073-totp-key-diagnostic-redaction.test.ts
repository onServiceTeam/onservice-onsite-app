import { decryptSecret, encryptSecret } from '../src/utils/totp';

function captureError(operation: () => unknown): Error {
  try { operation(); } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('Expected invalid encryption configuration to be rejected');
}

it('Bug SEC-073 — invalid TOTP encryption configuration never exposes supplied key material in diagnostics', () => {
  const original = process.env.TOTP_ENCRYPTION_KEY;
  try {
    // Deliberately invalid test-only values, never a real deployed key.
    for (const invalidKey of ['fixture-sensitive-prefix', 'G'.repeat(64)]) {
      process.env.TOTP_ENCRYPTION_KEY = invalidKey;
      for (const operation of [() => encryptSecret('test-only-authenticator-secret'), () => decryptSecret('enc:fixture')]) {
        const error = captureError(operation);
        expect(error.message).toContain('TOTP_ENCRYPTION_KEY must be exactly 64 hex chars');
        expect(error.message).toContain(`Got ${invalidKey.length} chars`);
        expect(error.message).not.toContain(invalidKey.slice(0, 8));
        expect(error.stack).not.toContain(invalidKey.slice(0, 8));
      }
    }
  } finally {
    if (original === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = original;
  }
});

it('valid configured encryption still round-trips with authenticated ciphertext and rejects tampering', () => {
  const original = process.env.TOTP_ENCRYPTION_KEY;
  try {
    process.env.TOTP_ENCRYPTION_KEY = 'a1'.repeat(32);
    const plaintext = 'test-only-authenticator-secret';
    const first = encryptSecret(plaintext);
    const second = encryptSecret(plaintext);
    expect(first).toMatch(/^enc:/);
    expect(second).not.toBe(first);
    expect(first).not.toContain(plaintext);
    expect(decryptSecret(first)).toBe(plaintext);
    expect(decryptSecret(second)).toBe(plaintext);
    const modified = Buffer.from(first.slice(4), 'base64');
    modified[modified.length - 1] = modified[modified.length - 1]! ^ 1;
    expect(() => decryptSecret(`enc:${modified.toString('base64')}`)).toThrow();
  } finally {
    if (original === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = original;
  }
});
