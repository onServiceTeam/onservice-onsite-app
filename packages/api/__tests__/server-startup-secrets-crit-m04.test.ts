import { validateProductionSecrets } from '../src/config/boot-guards';

const validProductionEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(64),
  DATA_EXPORT_DOWNLOAD_SECRET: 'd'.repeat(64),
  FEEDBACK_EXPORT_KEY: 'f'.repeat(64),
  TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
  TURNSTILE_SECRET_KEY: 'turnstile-live-secret',
  PAYMONGO_WEBHOOK_SECRET: 'paymongo-webhook-live-secret',
  DB_PASSWORD: 'database-production-secret',
  REDIS_PASSWORD: 'redis-production-secret',
});

describe('production startup secrets', () => {
  it('Bug CRIT-M04 — production rejects every missing, placeholder, or malformed required secret', () => {
    expect(() => validateProductionSecrets(validProductionEnv())).not.toThrow();

    for (const key of [
      'JWT_SECRET',
      'TOTP_ENCRYPTION_KEY',
      'TURNSTILE_SECRET_KEY',
      'PAYMONGO_WEBHOOK_SECRET',
      'DB_PASSWORD',
      'REDIS_PASSWORD',
    ]) {
      const env = validProductionEnv();
      delete env[key];
      expect(() => validateProductionSecrets(env)).toThrow(new RegExp(key));
    }

    expect(() => validateProductionSecrets({ ...validProductionEnv(), JWT_SECRET: 'short' }))
      .toThrow(/at least 32/);
    expect(() => validateProductionSecrets({ ...validProductionEnv(), TOTP_ENCRYPTION_KEY: 'not-hex' }))
      .toThrow(/64 hex/);
    expect(() => validateProductionSecrets({ ...validProductionEnv(), DB_PASSWORD: 'onservice_dev' }))
      .toThrow(/known dev/);
    expect(() => validateProductionSecrets({ ...validProductionEnv(), DB_PASSWORD: 'CHANGE_ME_STRONG_PASSWORD' }))
      .toThrow(/known dev/);
    expect(() => validateProductionSecrets({ NODE_ENV: 'test' })).not.toThrow();
  });
});
