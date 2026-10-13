/**
 * D38 private job media (Milestone 2, package P3 review fix): keep signed
 * media links out of logs and error tracking.
 *
 * A link /api/v1/job-media/file/<mediaId>.<viewerId>.<exp>.<sig> works as a
 * viewing link for up to 10 minutes and names the viewer, so it must not be
 * written where support staff or a log pipeline can read it (critique L11).
 * Used by:
 *   - server.ts: the request log (morgan) skips these paths, and the Sentry
 *     hooks drop their performance transactions and redact the token from
 *     error events;
 *   - routes/job-media.routes.ts: errors on the file route are answered and
 *     logged there without the path.
 *
 * Pure functions, no imports: server.ts loads this before Sentry.init.
 */

export const JOB_MEDIA_FILE_PATH_PREFIX = '/api/v1/job-media/file/';

const TOKEN_IN_TEXT = /\/api\/v1\/job-media\/file\/[^/?#\s"'<>]+/g;
const REDACTED_PATH = `${JOB_MEDIA_FILE_PATH_PREFIX}[redacted]`;

/** True for a request URL (path and optional query) of the signed file route. */
export function isJobMediaFileUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && url.startsWith(JOB_MEDIA_FILE_PATH_PREFIX);
}

/** Replace every signed media token in a string with "[redacted]". */
export function redactJobMediaTokensInText(text: string): string {
  return text.includes(JOB_MEDIA_FILE_PATH_PREFIX) ? text.replace(TOKEN_IN_TEXT, REDACTED_PATH) : text;
}

/**
 * Redact signed media tokens in every string of a plain object or array, in
 * place (Sentry error events are plain JSON-shaped objects). Returns the
 * same value.
 */
export function redactJobMediaTokens<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return redactJobMediaTokensInText(node);
    if (node === null || typeof node !== 'object' || seen.has(node)) return node;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) node[index] = walk(node[index]);
      return node;
    }
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = walk(record[key]);
    return node;
  };
  return walk(value) as T;
}

/**
 * Sentry beforeSendTransaction: drop the performance transaction of a signed
 * file read entirely (its URL, span data and request block all carry the
 * token); every other transaction is returned unchanged.
 */
export function dropJobMediaFileTransaction<T>(event: T): T | null {
  let text: string;
  try {
    text = JSON.stringify(event) ?? '';
  } catch {
    return null; // Cannot be checked: dropping a performance sample is harmless.
  }
  return text.includes(JOB_MEDIA_FILE_PATH_PREFIX) ? null : event;
}
