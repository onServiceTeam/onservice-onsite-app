// Phase D CRIT-69 + MED-K04 fix — canonical error-message extractor.
//
// Pre-fix: every screen rolled its own axios-shape error parser:
//   const axErr = err as { response?: { data?: { error?: { message?: string } } } };
//   const msg = axErr?.response?.data?.error?.message ?? 'Generic fallback';
//
// That shape was correct when the API client used axios (Bug 1271
// pre-fix) but incorrect after we switched to the native-fetch
// wrapper which now throws ApiError instances. ApiError surfaces the
// server message via .message (from the super() constructor) and
// .body.error.message (the raw payload). The legacy axios parser
// returned undefined for both → users got a generic fallback even
// when the server said exactly what was wrong (e.g. "Phone number
// already registered").
//
// Use getErrorMessage(err, fallback) everywhere. Single source of
// truth for the error envelope shape.

import { ApiError } from '@/services/api';

interface AxiosShapedError {
  response?: { data?: { error?: { message?: string } } };
  message?: string;
}

/**
 * Extract a user-facing error message from any thrown value.
 *
 * Resolution order:
 *   1. ApiError.body.error.message (canonical post-fetch-migration)
 *   2. ApiError.message (constructor super; same as #1 when populated)
 *   3. err.response.data.error.message (legacy axios shape — kept
 *      for back-compat in case any caller still wraps with axios)
 *   4. err.message (any Error subclass)
 *   5. fallback
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.body?.error?.message ?? err.message ?? fallback;
  }
  if (err && typeof err === 'object') {
    const maybe = err as AxiosShapedError;
    const fromResponse = maybe.response?.data?.error?.message;
    if (typeof fromResponse === 'string' && fromResponse.length > 0) {
      return fromResponse;
    }
    if (typeof maybe.message === 'string' && maybe.message.length > 0) {
      return maybe.message;
    }
  }
  if (typeof err === 'string' && err.length > 0) return err;
  return fallback;
}

/**
 * Returns the error code (e.g. 'token_expired', 'phone_already_registered')
 * if the API set one. Used by call sites that want to branch on the
 * machine-readable error type instead of message-matching.
 */
export function getErrorCode(err: unknown): string | null {
  if (err instanceof ApiError) {
    const code = err.body?.error?.code;
    return typeof code === 'string' ? code : null;
  }
  if (err && typeof err === 'object') {
    const maybe = err as { code?: unknown; response?: { data?: { error?: { code?: unknown } } } };
    if (typeof maybe.code === 'string') return maybe.code;
    const responseCode = maybe.response?.data?.error?.code;
    if (typeof responseCode === 'string') return responseCode;
  }
  return null;
}
