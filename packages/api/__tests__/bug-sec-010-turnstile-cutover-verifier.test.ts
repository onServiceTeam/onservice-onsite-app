import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const bash = process.platform === 'win32'
  ? 'C:\\Program Files\\Git\\bin\\bash.exe'
  : 'bash';

function runVerifier(extraEnv: Record<string, string> = {}) {
  const command = [
    'curl() {',
    '  printf \'%s\\n\' \'{"success":false,"error-codes":["invalid-input-response"]}\';',
    '}',
    'export -f curl',
    '. scripts/verify-turnstile.sh',
  ].join('\n');

  return spawnSync(bash, ['-c', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      TURNSTILE_SITE_KEY: '',
      EXPO_PUBLIC_TURNSTILE_SITE_KEY: '',
      CAPTCHA_SITE_KEY: '',
      TURNSTILE_SECRET_KEY: '',
      CAPTCHA_SECRET_KEY: '',
      ...extraEnv,
    },
  });
}

describe('Bug SEC-010 — launch verification follows the deployed CAPTCHA provider', () => {
  it('rejects missing and test credentials, then accepts a production-shaped Turnstile pair', () => {
    const missing = runVerifier();
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}${missing.stderr}`).toContain('TURNSTILE_SITE_KEY');

    const dummy = runVerifier({
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    });
    expect(dummy.status).not.toBe(0);
    expect(`${dummy.stdout}${dummy.stderr}`).toContain('test key');

    const production = runVerifier({
      TURNSTILE_SITE_KEY: '0x4AAAA-production-shaped-site-key',
      TURNSTILE_SECRET_KEY: '0x4AAAA-production-shaped-secret-key',
    });
    expect(production.status).toBe(0);
    expect(`${production.stdout}${production.stderr}`).toContain(
      'Turnstile production keys configured',
    );
  });
});
