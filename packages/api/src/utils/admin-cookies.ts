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
//                    refresh endpoint, 7 days.
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
  const accessLifetimeMs = 15 * 60 * 1000; // 15 min
  const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

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

// Re-export the configured admin-session lifetime so tests and route handlers
// can read it without copy-pasting magic numbers.
export const ADMIN_SESSION_ACCESS_LIFETIME_MS =
  Math.min(
    platformConfig.adminSessionTimeoutHours * 3600 * 1000,
    15 * 60 * 1000,
  );
