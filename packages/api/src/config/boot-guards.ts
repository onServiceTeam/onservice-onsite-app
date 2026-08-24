// Boot-time safety guards.
//
// These are intentionally PURE functions (no imports, no side effects) so a
// test can call them directly and assert real behavior — unlike server.ts,
// which binds a port and opens DB/Redis connections on import and therefore
// can't be unit-tested cleanly. server.ts calls these during boot.

/**
 * True when ADMIN_DISABLE_2FA is set to a recognized truthy value.
 *
 * Mirrors the exact check in routes/auth.routes.ts so the boot guard and the
 * login path agree on what "disabled" means.
 */
export function isAdmin2faDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ADMIN_DISABLE_2FA === '1' || env.ADMIN_DISABLE_2FA === 'true';
}

/**
 * A1 / C1 — refuse to boot if admin 2FA is disabled in production.
 *
 * ADMIN_DISABLE_2FA reduces admin login to email + password only (see
 * LAUNCH-LIMITATIONS.md #37). It is a deliberate escape hatch for
 * staging/testing, but leaving it on in production would strip the second
 * factor off the most privileged accounts in the system. The login path
 * already logs a loud warning, but a warning is easy to miss; this guard
 * makes the misconfiguration impossible to ship by throwing synchronously at
 * boot, before the HTTP server binds its port.
 *
 * Non-production behavior is unchanged: staging and development may set the
 * flag freely.
 */
export function assertAdmin2faNotDisabledInProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && isAdmin2faDisabled(env)) {
    throw new Error(
      'FATAL: production startup blocked — ADMIN_DISABLE_2FA is set while NODE_ENV=production. ' +
        'This reduces admin login to password-only and removes the second factor from the most ' +
        'privileged accounts. Unset ADMIN_DISABLE_2FA to restore mandatory TOTP 2FA before booting ' +
        'in production. See LAUNCH-LIMITATIONS.md #37 and packages/api/src/config/boot-guards.ts.',
    );
  }
}

/**
 * Refuse production startup when a required secret is absent, still uses a
 * public development value, or has an invalid cryptographic format.
 *
 * TURNSTILE_SECRET_KEY is canonical. CAPTCHA_SECRET_KEY remains an accepted
 * deployment-migration alias because the request verifier accepts the same
 * alias; startup and runtime must never disagree about a valid configuration.
 */
export function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const required: Record<string, string | undefined> = {
    JWT_SECRET: env.JWT_SECRET,
    TOTP_ENCRYPTION_KEY: env.TOTP_ENCRYPTION_KEY,
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY || env.CAPTCHA_SECRET_KEY,
    PAYMONGO_WEBHOOK_SECRET: env.PAYMONGO_WEBHOOK_SECRET,
    DB_PASSWORD: env.DB_PASSWORD,
    REDIS_PASSWORD: env.REDIS_PASSWORD,
  };
  const problems: string[] = [];

  for (const [key, value] of Object.entries(required)) {
    if (!value) problems.push(`${key} is unset/empty`);
  }

  const devDefaults = new Set([
    'dev-only-jwt-secret-not-for-prod-32-bytes-minimum-please-rotate',
    '9fdb19af3d5c77a9809173fb496d6a4acf69836bef1e5c7d4b42783360a4c237',
    'change-this-to-a-secure-random-string',
    '__GENERATE_64_HEX_CHARS__',
    'whsk_xxxxxxxxxxxx',
    'onservice_dev',
  ]);
  const placeholderMarkers = [/dev-only/i, /change-me/i, /change-this/i, /not-for-prod/i, /xxxxxxxx/i, /x{8,}/];
  for (const [key, value] of Object.entries(required)) {
    if (!value) continue;
    if (devDefaults.has(value) || placeholderMarkers.some((pattern) => pattern.test(value))) {
      problems.push(`${key} is a known dev/placeholder default — rotate it`);
    }
  }

  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters');
  }
  if (env.TOTP_ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(env.TOTP_ENCRYPTION_KEY)) {
    problems.push('TOTP_ENCRYPTION_KEY must be exactly 64 hex characters');
  }

  if (problems.length > 0) {
    throw new Error(
      `FATAL: production startup blocked — secret validation failed: ${problems.join('; ')}. ` +
        'Each value must be configured (and rotated off the dev defaults) before the API will boot ' +
        'in production. See packages/api/src/config/boot-guards.ts for the full list.',
    );
  }
}

/** Return the validated Express trust-proxy hop count, or null to disable it. */
export function resolveTrustProxyHops(env: NodeJS.ProcessEnv = process.env): number | null {
  const hops = Number(env.TRUST_PROXY_HOPS ?? 1);
  return Number.isFinite(hops) && hops > 0 ? hops : null;
}
