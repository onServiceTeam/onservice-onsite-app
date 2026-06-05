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
