// apps/mobile/src/services/api.ts
//
// Bug 1271 fix verified — Constitution Article 7.1: native fetch wrapper,
// no axios. Phase 14 Dispatch 02 Part 5.
//
// Mirrors apps/admin/src/lib/api.ts (the same envelope) so mobile callsites
// keep using `res.data.data` without churn. Differences from admin:
//   - Mobile auth is Bearer-token (Bug 1061: tokens live in OS-keychain-
//     encrypted secure-storage). NOT cookie-based — mobile is not a browser.
//   - On 401, refresh against /auth/refresh-token (the mobile route), then
//     replay the original request once.
//   - On refresh failure, clear secure storage + legacy cache.
//
// Same `params` shim and `responseType: 'blob'` shim as the admin wrapper
// for axios-compat callsites. Default generic <T = any> matches axios's
// permissive default (mobile callsites cast at the use-site).

import { platformConfig } from '@/config/platform.config';
import {
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  storeTokens,
  clearTokens,
  removeSecureItem,
} from './secure-storage';
import { getDeviceFingerprint } from './device-fingerprint.service';

// MMKV cache for non-PII data (push token, hasOnboarded flag etc.).
// Tokens + user PII are in `./secure-storage` (OS-keychain-encrypted) per
// Bug 1061 fix. The legacy MMKV id `'onservice-auth'` is preserved here
// only so `auth-migration.ts` can read pre-fix tokens once at boot.
let mmkvInstance: import('react-native-mmkv').MMKV | null = null;

function initStorage(): void {
  if (mmkvInstance) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    mmkvInstance = createMMKV({ id: 'onservice-auth' });
  } catch {
    /* MMKV not available in tests / SSR */
  }
}

const fallbackStore = new Map<string, string | boolean>();

export const storage = {
  getString: (key: string): string | undefined => {
    initStorage();
    if (mmkvInstance) return mmkvInstance.getString(key);
    return fallbackStore.get(key) as string | undefined;
  },
  set: (key: string, value: string | boolean): void => {
    initStorage();
    if (mmkvInstance) { mmkvInstance.set(key, value); return; }
    fallbackStore.set(key, value);
  },
  delete: (key: string): void => {
    initStorage();
    if (mmkvInstance) { mmkvInstance.remove(key); return; }
    fallbackStore.delete(key);
  },
  getBoolean: (key: string): boolean | undefined => {
    initStorage();
    if (mmkvInstance) return mmkvInstance.getBoolean(key);
    return fallbackStore.get(key) as boolean | undefined;
  },
};

// ── Fetch wrapper ───────────────────────────────────────────────────────

interface ApiSuccess<T> { success: true; data: T }
interface ApiFailure {
  success: false;
  error: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: Array<{ field: string; message: string }>;
  };
}
export type ApiResponseEnvelope<T> = ApiSuccess<T> | ApiFailure;

export class ApiError extends Error {
  status: number;
  body: ApiFailure | null;
  constructor(status: number, body: ApiFailure | null, fallback: string) {
    super(body?.error?.message ?? fallback);
    this.status = status;
    this.body = body;
  }
}

interface ApiRequestInit extends Omit<RequestInit, 'body' | 'method'> {
  /** One-time proof operations must opt out of session refresh/replay. */
  auth?: 'session' | 'session-no-replay' | 'anonymous';
  method?: string;
  body?: unknown;
  params?: Record<string, unknown>;
  responseType?: 'json' | 'blob' | 'text' | 'arraybuffer';
  /** Per-request override for the Bearer token. Used during the refresh flow. */
  _bearerOverride?: string;
}

interface ApiAxiosLikeResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

function appendParams(url: string, params?: ApiRequestInit['params']): string {
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.append(k, String(v));
  }
  const qs = search.toString();
  if (!qs) return url;
  return url + (url.includes('?') ? '&' : '?') + qs;
}

function buildAbsoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return platformConfig.apiUrl + url;
}

async function rawFetch<T>(url: string, init: ApiRequestInit): Promise<ApiAxiosLikeResponse<T>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const finalUrl = appendParams(buildAbsoluteUrl(url), init.params);
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const bearer = init._bearerOverride ?? getAccessToken();
  if (bearer && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }

  let serializedBody: BodyInit | undefined;
  if (init.body !== undefined) {
    serializedBody = init.body instanceof FormData ? init.body : JSON.stringify(init.body);
  }

  const controller = new AbortController();
  let cancelBody: (() => void) | undefined;
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abortReason = (): unknown => controller.signal.reason
    ?? Object.assign(new Error('The request was aborted.'), { name: 'AbortError' });
  const onAbort = (): void => {
    cancelBody?.();
    rejectAbort(abortReason());
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const abortFromCaller = (): void => controller.abort(init.signal?.reason);

  try {
    const operation = (async (): Promise<ApiAxiosLikeResponse<T>> => {
      // A caller may cancel sooner, but must not replace the request's deadline.
      if (init.signal?.aborted) abortFromCaller();
      else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
      if (controller.signal.aborted) throw abortReason();
      const res = await fetch(finalUrl, {
        ...init,
        method,
        headers,
        body: serializedBody,
        signal: controller.signal,
      });
      // A transport may ignore its signal, including after returning headers.
      // Never consume/deliver a late response; explicitly cancel streamed bodies.
      if (controller.signal.aborted) {
        void res.body?.cancel().catch(() => undefined);
        throw abortReason();
      }
      const readBody = async (binary = false): Promise<string | Blob> => {
        if (!res.body?.getReader) return binary ? res.blob() : res.text();
        const reader = res.body.getReader();
        cancelBody = (): void => { void reader.cancel(abortReason()).catch(() => undefined); };
        try {
          const decoder = binary ? null : new globalThis.TextDecoder();
          const chunks: ArrayBuffer[] = [];
          let text = '';
          while (true) {
            const { done, value } = await reader.read();
            if (controller.signal.aborted) throw abortReason();
            if (done) break;
            if (decoder) text += decoder.decode(value, { stream: true });
            else chunks.push(new Uint8Array(value).buffer);
          }
          return decoder ? text + decoder.decode()
            : new Blob(chunks, { type: res.headers.get('Content-Type') ?? '' });
        } catch (error) {
          void reader.cancel(error).catch(() => undefined);
          throw error;
        } finally {
          cancelBody = undefined;
          reader.releaseLock();
        }
      };

      // Fetch resolves at headers. Keep cancellation alive until its body is read.
      if (init.responseType === 'blob') {
        if (!res.ok) {
          const errText = await readBody().catch(error => {
            // An interrupted 401 body is not permission to refresh/replay a POST.
            if (controller.signal.aborted) throw error;
            return '';
          });
          let errBody: ApiFailure | null = null;
          try { errBody = errText ? (JSON.parse(errText as string) as ApiFailure) : null; } catch { /* ignore */ }
          throw new ApiError(res.status, errBody, `HTTP ${res.status}`);
        }
        const blob = await readBody(true);
        return { data: blob as unknown as T, status: res.status, ok: true };
      }

      let parsed: unknown = null;
      const text = await readBody();
      if (text) {
        try { parsed = JSON.parse(text as string); } catch { /* not JSON */ }
      }

      if (!res.ok) {
        throw new ApiError(res.status, parsed as ApiFailure | null, `HTTP ${res.status}`);
      }
      return { data: parsed as T, status: res.status, ok: true };
    })();
    // Also settle non-streaming native transports that ignore AbortSignal.
    // The observed operation cannot later deliver credentials or replay a POST.
    return await Promise.race([operation, aborted]);
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', abortFromCaller);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

// Phase K MED-K03 fix — single-flight refresh.
//
// Pre-fix: when N concurrent requests all 401'd at once (common after
// token expiry, e.g. app foregrounded with stale token), each one
// called refreshOnce() in parallel. The first refresh succeeded and
// rotated the token; the next N refreshes presented the now-deleted
// old token, server returned 401, all retried requests then ALSO
// failed. Net: stale-token storms triggered forced logouts that
// shouldn't have happened.
//
// Post-fix: single-flight gate. The first 401 starts the refresh;
// concurrent 401s await the SAME in-flight promise instead of
// kicking off their own refresh. After the refresh resolves, the
// gate is cleared and subsequent 401s start fresh.
interface RefreshFlight { ownerId: string | null; refreshToken: string; promise: Promise<string | null> }
let inFlightRefresh: RefreshFlight | null = null;
let authSessionExpiredHandler: (() => void) | null = null;

function currentAccountId(): string | null {
  const stored = getStoredUser();
  if (!stored) return null;
  try {
    const user = JSON.parse(stored) as { id?: unknown } | null;
    return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null;
  } catch { return null; }
}

function assertSameAccount(ownerId: string | null): void {
  if (currentAccountId() === ownerId) return;
  throw accountChangedError();
}

function accountChangedError(): ApiError {
  return new ApiError(409, { success: false, error: {
    code: 'account_changed', statusCode: 409,
    message: 'Your sign-in session changed. Reload this screen before trying again.',
  } }, 'Your sign-in session changed.');
}

/**
 * Keep the transport independent from the Zustand store while still allowing
 * a terminal refresh failure to update in-memory auth state immediately.
 */
export function setAuthSessionExpiredHandler(handler: () => void): void {
  authSessionExpiredHandler = handler;
}

async function refreshOnce(): Promise<string | null> {
  const ownerId = currentAccountId();
  const refreshToken = getRefreshToken();
  // UX-1315: do not leave a permanently resolved-null flight after this exit.
  if (!refreshToken) return null;
  // UX-1314: another account or a newer login for the same account must never
  // join the previous session's rotation. Normal rotation updates this key.
  if (inFlightRefresh?.ownerId === ownerId && inFlightRefresh.refreshToken === refreshToken) return inFlightRefresh.promise;

  const flight: RefreshFlight = { ownerId, refreshToken, promise: Promise.resolve(null) };
  inFlightRefresh = flight;
  flight.promise = (async () => {
    try {
      let deviceFingerprint: string | undefined;
      try { deviceFingerprint = await getDeviceFingerprint(); }
      catch { deviceFingerprint = undefined; } // Best-effort on supported clients.
      if (currentAccountId() !== ownerId || getRefreshToken() !== refreshToken) return null;
      const res = await rawFetch<{ success: boolean; data: { accessToken: string; refreshToken?: string } }>(
        '/api/v1/auth/refresh-token',
        { method: 'POST', body: { refreshToken, deviceFingerprint }, _bearerOverride: '' },
      );
      // Logging out or signing in while the request is in flight must not
      // resurrect old credentials or replace the newer token pair.
      if (currentAccountId() !== ownerId || getRefreshToken() !== refreshToken) return null;
      const data = res.data?.data;
      if (typeof data?.accessToken !== 'string' || !data.accessToken
        || (data.refreshToken !== undefined && (typeof data.refreshToken !== 'string' || !data.refreshToken))) return null;
      storeTokens(data.accessToken, data.refreshToken ?? refreshToken);
      flight.refreshToken = data.refreshToken ?? refreshToken;
      return data.accessToken;
    } catch {
      return null;
    } finally {
      // Let same-account awaiters share this result for this tick. A late
      // previous-account completion must not erase a newer flight's gate.
      setTimeout(() => { if (inFlightRefresh === flight) inFlightRefresh = null; }, 0);
    }
  })();
  return flight.promise;
}

/**
 * Rotate the current mobile token pair on demand without changing authority.
 * A canonical role change rejects the old pair and requires fresh sign-in.
 * Staff-invite acceptance has its own server-issued replacement credentials.
 */
export async function refreshAuthSession(): Promise<boolean> {
  return (await refreshOnce()) !== null;
}

async function request<T>(
  url: string, init: ApiRequestInit, isRetry = false, ownerId = currentAccountId(),
): Promise<ApiAxiosLikeResponse<T>> {
  const { auth = 'session', ...requestInit } = init;
  if (!['session', 'session-no-replay', 'anonymous'].includes(auth)) {
    throw new Error('Invalid request authentication mode.');
  }
  const noReplay = auth !== 'session';
  const initiatingRefreshToken = noReplay ? getRefreshToken() : undefined;
  try {
    assertSameAccount(ownerId);
    if (noReplay) {
      // Proof requests use only their selected authority, never caller-supplied
      // or ambient cookies. Do not forward this private policy option to fetch.
      const headers = new Headers(requestInit.headers);
      headers.delete('Authorization');
      headers.delete('Cookie');
      headers.delete('Cookie2');
      Object.assign(requestInit, { headers, credentials: 'omit', cache: 'no-store',
        redirect: 'error', _bearerOverride: auth === 'anonymous' ? '' : getAccessToken() ?? '' });
    }
    const result = await rawFetch<T>(url, requestInit);
    assertSameAccount(ownerId); // Do not deliver old-account data to a new UI.
    if (noReplay && getRefreshToken() !== initiatingRefreshToken) throw accountChangedError();
    return result;
  } catch (err) {
    assertSameAccount(ownerId); // Do not replay or sign out a different account.
    // Also reject an older proof response after a new login/rotation for the
    // same account. A caller must resolve uncertainty, not apply old credentials.
    if (noReplay && getRefreshToken() !== initiatingRefreshToken) throw accountChangedError();
    if (noReplay) throw err;
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      !isRetry &&
      !url.endsWith('/api/v1/auth/refresh-token')
    ) {
      const refreshTokenBefore = getRefreshToken();
      const newToken = await refreshOnce();
      assertSameAccount(ownerId);
      if (newToken) {
        return await request<T>(url, { ...init, _bearerOverride: newToken }, true, ownerId);
      }
      if (getRefreshToken() !== refreshTokenBefore) throw accountChangedError();
      // Refresh failed → tokens are dead. Clear secure store + legacy cache.
      clearTokens();
      removeSecureItem('user');
      storage.delete('accessToken');
      storage.delete('refreshToken');
      storage.delete('user');
      authSessionExpiredHandler?.();
    }
    throw err;
  }
}

const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(url: string, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'GET' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: <T = any>(url: string, body?: unknown, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'POST', body }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put: <T = any>(url: string, body?: unknown, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'PUT', body }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: <T = any>(url: string, body?: unknown, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'PATCH', body }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: <T = any>(url: string, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'DELETE' }),
};

export default api;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
