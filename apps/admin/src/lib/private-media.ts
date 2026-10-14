/**
 * D38 private media helpers for the admin panel (Milestone 2, package P6-M2).
 *
 * The API signs every private photo, video and voice-note link
 * (packages/api/src/services/job-media.service.ts `mint`). A link is
 * root-relative (/api/v1/job-media/file/<token>), so the admin page loads it
 * through its own /api proxy, and it carries an `expiresAt` ISO time a few
 * minutes ahead (JOB_MEDIA_CONFIG.urlTtlSeconds). After that time the file
 * route answers 410, so a player that tries to load it fails.
 *
 * Minting links for an admin writes an audit row (job_media_viewed or
 * conversation_viewed), so screens never refresh links on a timer: they say
 * the links expired and fetch new ones only when the admin asks, or when a
 * player fails because its link expired.
 */
import { useEffect, useState } from 'react';

/** Milliseconds since epoch of an ISO time, or null when missing or unreadable. */
export function parseExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) ? ms : null;
}

/** The earliest readable expiry among the given links. */
export function earliestExpiry(values: ReadonlyArray<string | null | undefined>): number | null {
  let earliest: number | null = null;
  for (const value of values) {
    const ms = parseExpiry(value);
    if (ms !== null && (earliest === null || ms < earliest)) earliest = ms;
  }
  return earliest;
}

/**
 * The expiry to watch for links fetched at `fetchedAt`, or null. A link that
 * already looked expired when it arrived means this computer's clock is
 * ahead of the server's; the server still honours it, so the screen neither
 * claims it expired nor reloads it.
 */
export function watchableExpiry(expiryMs: number | null, fetchedAt: number): number | null {
  return expiryMs !== null && expiryMs > fetchedAt ? expiryMs : null;
}

/**
 * Should a player failure reload the links? Only when the link was live when
 * it was fetched and has expired since. Any other failure (a format this
 * browser cannot play, a missing file) gets a plain message instead, so a
 * failure can never start a reload loop, and every reload is an audited view.
 */
export function expiredSinceFetch(
  expiresAt: string | null | undefined,
  fetchedAt: number,
  now: number = Date.now(),
): boolean {
  const ms = parseExpiry(expiresAt);
  return ms !== null && fetchedAt < ms && now >= ms;
}

/** Most automatic link reloads one open screen may make; after that only the button reloads. */
export const MAX_AUTOMATIC_LINK_RELOADS = 3;

/**
 * True once `expiresAtMs` has passed. Re-renders the caller at that moment
 * (one timer, no polling). A later expiry (fresh links) resets it.
 */
export function useHasExpired(expiresAtMs: number | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAtMs === null) return undefined;
    const wait = expiresAtMs - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return undefined;
    }
    // setTimeout holds at most a signed 32-bit delay.
    const timer = setTimeout(() => setNow(Date.now()), Math.min(wait + 250, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [expiresAtMs]);
  return expiresAtMs !== null && now >= expiresAtMs;
}

/** m:ss for a recording length in milliseconds; null when unknown. */
export function formatMediaDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** A short file size such as "820 KB" or "2.4 MB"; null when unknown. */
export function formatMediaBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Error code the API attached to a failed request ({error: {code}}), if any. */
export function apiErrorCode(error: unknown): string | null {
  const body = (error as { body?: { error?: { code?: unknown } } } | null)?.body;
  const code = body?.error?.code;
  return typeof code === 'string' ? code : null;
}

/** HTTP status of a failed request, if the client recorded one. */
export function apiErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}
