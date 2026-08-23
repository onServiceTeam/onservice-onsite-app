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
  storeTokens,
  clearTokens,
  removeSecureItem,
} from './secure-storage';

// MMKV cache for non-PII data (push token, hasOnboarded flag etc.).
// Tokens + user PII are in `./secure-storage` (OS-keychain-encrypted) per
// Bug 1061 fix. The legacy MMKV id `'onservice-auth'` is preserved here
// only so `auth-migration.ts` can read pre-fix tokens once at boot.
let mmkvInstance: { getString: (k: string) => string | undefined; set: (k: string, v: string | boolean) => void; delete: (k: string) => void; getBoolean: (k: string) => boolean | undefined } | null = null;

function initStorage(): void {
  if (mmkvInstance) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv');
    mmkvInstance = new MMKV({ id: 'onservice-auth' });
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
    if (mmkvInstance) { mmkvInstance.delete(key); return; }
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
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(finalUrl, {
      ...init,
      method,
      headers,
      body: serializedBody,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (init.responseType === 'blob') {
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errBody: ApiFailure | null = null;
      try { errBody = errText ? (JSON.parse(errText) as ApiFailure) : null; } catch { /* ignore */ }
      throw new ApiError(res.status, errBody, `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    return { data: blob as unknown as T, status: res.status, ok: true };
  }

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  }

  if (!res.ok) {
    throw new ApiError(res.status, parsed as ApiFailure | null, `HTTP ${res.status}`);
  }
  return { data: parsed as T, status: res.status, ok: true };
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
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  // Coalesce concurrent callers onto the same in-flight refresh.
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await rawFetch<{ success: boolean; data: { accessToken: string; refreshToken?: string } }>(
        '/api/v1/auth/refresh-token',
        { method: 'POST', body: { refreshToken }, _bearerOverride: '' },
      );
      const data = res.data?.data;
      if (!data?.accessToken) return null;
      storeTokens(data.accessToken, data.refreshToken ?? refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      // Clear the gate AFTER the promise settles so the next 401
      // (which arrives after the rotation) starts a fresh refresh.
      // We microtask-defer the clear so other awaiters resolve
      // against the SAME promise reference before it's nulled.
      setTimeout(() => { inFlightRefresh = null; }, 0);
    }
  })();
  return inFlightRefresh;
}

/**
 * Rotate the current mobile token pair on demand. Approval and staff-role
 * transitions use this before entering a workspace whose API authorization is
 * carried in the access-token role claim.
 */
export async function refreshAuthSession(): Promise<boolean> {
  return (await refreshOnce()) !== null;
}

async function request<T>(url: string, init: ApiRequestInit, isRetry = false): Promise<ApiAxiosLikeResponse<T>> {
  try {
    return await rawFetch<T>(url, init);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      !isRetry &&
      !url.endsWith('/api/v1/auth/refresh-token')
    ) {
      const newToken = await refreshOnce();
      if (newToken) {
        return await request<T>(url, { ...init, _bearerOverride: newToken }, true);
      }
      // Refresh failed → tokens are dead. Clear secure store + legacy cache.
      clearTokens();
      removeSecureItem('user');
      storage.delete('accessToken');
      storage.delete('refreshToken');
      storage.delete('user');
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
