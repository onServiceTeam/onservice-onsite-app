// packages/api/src/utils/admin-cookies.ts
//
// Helpers for setting / clearing the three admin session cookies.
// Phase 14 Dispatch 01 Bug 1251 fix.
//
// Three cookies:
//   admin_session  — HttpOnly, Secure, SameSite=Strict, Path=/api, 15 min.
//                    Contains the access JWT. Browser sends on every same-
//                    origin /api/* request. JS cannot read it (HttpOnly).
//   admin_refresh  — HttpOnly, Secure, SameSite=Strict, scoped to the
//                    refresh endpoint, configured admin session lifetime.
//   admin_csrf     — NOT HttpOnly, Secure, SameSite=Strict, Path=/, 15 min.
//                    JS reads it and echoes the value in X-CSRF-Token on
//                    every write. The middleware compares cookie ↔ header.

import crypto from 'node:crypto';
import type { Response } from 'express';
import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';

const REFRESH_PATH = '/api/v1/auth/admin/refresh';

interface IssuedCookies {
  csrfToken: string;
}

/**
 * Mint a new CSRF token, persist it in admin_csrf_tokens, and set all
 * three admin session cookies on the response.
 *
 * Returns the CSRF token in case the caller wants to log it (don't log
 * the access/refresh JWTs).
 */
export async function setAdminSessionCookies(
  res: Response,
  args: {
    accessToken: string;
    refreshToken: string;
    adminUserId: string;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<IssuedCookies> {
  const isProduction = process.env.NODE_ENV === 'production';
  const accessLifetimeMs = ADMIN_SESSION_ACCESS_LIFETIME_MS;
  const refreshLifetimeMs = platformConfig.adminSessionTimeoutHours * 60 * 60 * 1000;

  // Generate CSRF token (32 bytes → 43-char base64url string).
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const csrfExpiresAt = new Date(Date.now() + accessLifetimeMs);

  // Persist in admin_csrf_tokens for server-side validation.
  await db.query(
    `INSERT INTO admin_csrf_tokens (admin_user_id, token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      args.adminUserId,
      csrfToken,
      args.ipAddress ?? null,
      args.userAgent ?? null,
      csrfExpiresAt,
    ],
  );

  // 1. Access JWT (HttpOnly).
  res.cookie('admin_session', args.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: accessLifetimeMs,
  });

  // 2. Refresh token (HttpOnly, scoped to the refresh endpoint).
  res.cookie('admin_refresh', args.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: refreshLifetimeMs,
  });

  // 3. CSRF token (JS-readable on purpose).
  res.cookie('admin_csrf', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: accessLifetimeMs,
  });

  return { csrfToken };
}

/**
 * Clear all three admin session cookies. Called by the admin logout
 * endpoint. Caller is responsible for revoking the refresh token in the
 * database — this helper only clears browser state.
 */
export function clearAdminSessionCookies(res: Response): void {
  // Match the cookie's path on clear, otherwise the browser keeps it.
  res.clearCookie('admin_session', { path: '/api' });
  res.clearCookie('admin_refresh', { path: REFRESH_PATH });
  res.clearCookie('admin_csrf', { path: '/' });
}

/**
 * Mark all CSRF tokens for an admin user as revoked. Called on logout
 * and on password change. Idempotent.
 */
export async function revokeAdminCsrfTokens(adminUserId: string): Promise<void> {
  await db.query(
    `UPDATE admin_csrf_tokens
        SET revoked_at = NOW()
      WHERE admin_user_id = $1
        AND revoked_at IS NULL`,
    [adminUserId],
  );
}

// MED-M12 audit context — the audit flagged this as ignoring the
// admin-tunable platformConfig.adminSessionTimeoutHours, but the
// 15-minute cap on the ACCESS cookie is intentional security and
// orthogonal to the admin SESSION timeout (which governs the
// refresh cookie, not the access cookie).
//
// The architecture is:
//   - access cookie (this constant) — short-lived JWT carrying
//     identity for one request burst. Hard-capped at 15 min so a
//     stolen cookie can do at most 15 min of damage before requiring
//     a refresh round-trip (which re-validates the stored refresh token,
//     current user role/activity/session generation, fingerprint, and CSRF).
//   - refresh cookie + refresh-token JWT/row — governed by
//     platformConfig.adminSessionTimeoutHours (currently 8 h). This is what
//     the privileged-session contract describes. There is no separate
//     admin_sessions table.
//   - admin_csrf_tokens.expires_at — bound to the access cookie
//     lifetime so refresh re-mints the CSRF token in lockstep.
//
// We keep the 15-min cap and document the intent loudly so the
// audit's reading doesn't get re-applied. The Math.min preserves
// the case where an admin explicitly configures <15 min for tighter
// security.
export const ADMIN_SESSION_ACCESS_LIFETIME_MS =
  Math.min(
    platformConfig.adminSessionTimeoutHours * 3600 * 1000,
    15 * 60 * 1000,
  );
