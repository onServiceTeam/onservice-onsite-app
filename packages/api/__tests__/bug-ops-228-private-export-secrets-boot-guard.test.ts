import {
  isPrivateExportSecretUsable,
  validateProductionSecrets,
} from '../src/config/boot-guards';

function productionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    DATA_EXPORT_DOWNLOAD_SECRET: 'b'.repeat(64),
    FEEDBACK_EXPORT_KEY: 'c'.repeat(64),
    TOTP_ENCRYPTION_KEY: 'd'.repeat(64),
    TURNSTILE_SECRET_KEY: 'turnstile-secret-that-is-not-a-placeholder',
    PAYMONGO_WEBHOOK_SECRET: 'webhook-secret-that-is-not-a-placeholder',
    DB_PASSWORD: 'database-secret-that-is-not-a-placeholder',
    REDIS_PASSWORD: 'redis-secret-that-is-not-a-placeholder',
  };
}

it('Bug OPS-228 — production rejects missing, short, or repository-known private export secrets', () => {
  expect(isPrivateExportSecretUsable('s'.repeat(64))).toBe(true);
  expect(isPrivateExportSecretUsable(undefined)).toBe(false);
  expect(isPrivateExportSecretUsable('too-short')).toBe(false);
  expect(isPrivateExportSecretUsable('CHANGE_ME_GENERATE_INDEPENDENT_RANDOM_64_BYTES')).toBe(false);

  expect(() => validateProductionSecrets(productionEnv())).not.toThrow();

  const missingDataExport = productionEnv();
  delete missingDataExport.DATA_EXPORT_DOWNLOAD_SECRET;
  expect(() => validateProductionSecrets(missingDataExport)).toThrow(
    /DATA_EXPORT_DOWNLOAD_SECRET is unset\/empty/,
  );

  expect(() => validateProductionSecrets({
    ...productionEnv(),
    FEEDBACK_EXPORT_KEY: 'CHANGE_ME_GENERATE_INDEPENDENT_RANDOM_64_BYTES',
  })).toThrow(/FEEDBACK_EXPORT_KEY is a known dev\/placeholder default/);

  expect(() => validateProductionSecrets({
    ...productionEnv(),
    DATA_EXPORT_DOWNLOAD_SECRET: 'too-short',
  })).toThrow(/DATA_EXPORT_DOWNLOAD_SECRET must be at least 32 characters/);
});
