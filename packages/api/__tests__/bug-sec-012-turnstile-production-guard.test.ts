import { validateProductionSecrets } from '../src/config/boot-guards';

const baseEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(64),
  TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
  PAYMONGO_WEBHOOK_SECRET: 'paymongo-webhook-live-secret',
  DB_PASSWORD: 'database-production-secret',
  REDIS_PASSWORD: 'redis-production-secret',
});

describe('Turnstile production startup guard', () => {
  it('Bug SEC-012 — canonical Turnstile and legacy CAPTCHA secrets both satisfy the fail-closed startup guard', () => {
    expect(() => validateProductionSecrets({
      ...baseEnv(),
      TURNSTILE_SECRET_KEY: 'turnstile-live-secret',
    })).not.toThrow();
    expect(() => validateProductionSecrets({
      ...baseEnv(),
      CAPTCHA_SECRET_KEY: 'legacy-migration-secret',
    })).not.toThrow();
    expect(() => validateProductionSecrets(baseEnv())).toThrow(/TURNSTILE_SECRET_KEY is unset/);
  });
});
