// apps/admin/src/lib/api.ts
//
// Bug 1271 fix verified — native fetch wrapper, no axios.
// Bug 1251 fix verified — admin auth uses HttpOnly cookies + CSRF.
//
// Three cookies (set by the API on /admin/login + /admin/2fa/verify):
//   admin_session — HttpOnly, browser sends automatically on /api/* requests.
//   admin_refresh — HttpOnly, scoped to /api/v1/auth/admin/refresh.
//   admin_csrf    — JS-readable, value echoed in X-CSRF-Token on every write.
//
// On 401, the wrapper transparently calls /api/v1/auth/admin/refresh once
// and replays the original request. If refresh also fails, redirects to
// /login.

import { assertAdminRequestSession, captureAdminRequestSession, retireAdminRequestSession } from './admin-request-session';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: { message: string; statusCode?: number; code?: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

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
  /** Plain JSON-serializable body. Wrapper handles JSON.stringify. */
  body?: unknown;
  /** Axios-compatibility shim — values are appended as URL query parameters. */
  params?: Record<string, unknown>;
  /** Axios-compatibility shim. The wrapper currently ignores this; keep for typing parity only. */
  responseType?: 'json' | 'blob' | 'text' | 'arraybuffer';
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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PRE_AUTH_ENDPOINTS = new Set([
  '/api/v1/auth/admin/login',
  '/api/v1/auth/admin/2fa/setup',
  '/api/v1/auth/admin/2fa/verify',
  '/api/v1/auth/admin/2fa/enable',
]);

function canRefreshAfter401(url: string): boolean {
  return !PRE_AUTH_ENDPOINTS.has(url.split('?')[0] ?? url);
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)admin_csrf=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

interface ApiAxiosLikeResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

async function rawFetch<T>(url: string, init: ApiRequestInit): Promise<ApiAxiosLikeResponse<T>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const finalUrl = appendParams(url, init.params);
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (!SAFE_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  let serializedBody: BodyInit | undefined;
  if (init.body !== undefined) {
    serializedBody = init.body instanceof FormData ? init.body : JSON.stringify(init.body);
  }

  const res = await fetch(finalUrl, {
    ...init,
    method,
    headers,
    credentials: 'include', // send admin_session / admin_csrf cookies
    body: serializedBody,
  });

  // Blob responseType bypasses JSON parsing and returns the raw Blob.
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

  // Return an axios-like envelope so existing call sites that read `res.data`
  // continue to work without churn. The API server already wraps payloads in
  // `{ success, data }`, so callers see `res.data.data` exactly as before.
  return { data: parsed as T, status: res.status, ok: true };
}

async function request<T>(
  url: string,
  init: ApiRequestInit,
  isRetry = false,
  session?: object,
): Promise<ApiAxiosLikeResponse<T>> {
  if (!session) {
    // An explicit sign-in is newer intent than an outstanding startup check
    // or request. Retire those before sending, not only after login completes.
    if (!isRetry && init.method === 'POST' && url.split('?')[0] === '/api/v1/auth/admin/login') {
      retireAdminRequestSession();
    }
    session = captureAdminRequestSession();
  }
  try {
    assertAdminRequestSession(session, init.signal);
    const response = await rawFetch<T>(url, init);
    assertAdminRequestSession(session, init.signal);
    return response;
  } catch (err) {
    // An obsolete result must not refresh/replay a write or redirect another
    // operator. Check again after response parsing, not only before fetch.
    assertAdminRequestSession(session, init.signal);
    if (
      err instanceof ApiError
      && err.body?.error?.code === 'password_rotation_required'
      && typeof window !== 'undefined'
      && window.location.pathname !== '/change-password'
    ) {
      window.history.replaceState(null, '', '/change-password');
      // Use the base event constructor so the shared ESLint environment does
      // not require a browser-only PopStateEvent global. React Router only
      // needs the event type after replaceState has updated the URL.
      window.dispatchEvent(new Event('popstate'));
      throw err;
    }
    if (
      err instanceof ApiError
      && err.status === 401
      && !isRetry
      && !url.endsWith('/api/v1/auth/admin/refresh')
      && canRefreshAfter401(url)
    ) {
      try {
        await rawFetch('/api/v1/auth/admin/refresh', { method: 'POST', body: {} });
        assertAdminRequestSession(session, init.signal);
        return await request<T>(url, init, true, session);
      } catch {
        assertAdminRequestSession(session, init.signal);
        // Redirect to the login screen when a session genuinely expired — but
        // NOT if we are already on /login. Pre-fix, the auth bootstrap's
        // /auth/me probe on the login page 401'd, the refresh below 401'd too,
        // and this unconditionally set window.location.href = '/login'. On the
        // login page that is the *current* URL, so the assignment forced a full
        // page reload, which re-ran the bootstrap, which 401'd again — an
        // infinite reload loop that wiped the login form roughly once a second
        // and made signing in impossible. The pathname guard breaks the loop:
        // on /login we just surface the 401 to the caller (hydrate catches it
        // and settles into a clean logged-out state).
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        throw err;
      }
    }
    throw err;
  }
}

const api = {
  get: // eslint-disable-next-line @typescript-eslint/no-explicit-any
<T = any>(url: string, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'GET' }),
  post: // eslint-disable-next-line @typescript-eslint/no-explicit-any
<T = any>(url: string, body?: unknown, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'POST', body }),
  put: // eslint-disable-next-line @typescript-eslint/no-explicit-any
<T = any>(url: string, body?: unknown, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'PUT', body }),
  patch: // eslint-disable-next-line @typescript-eslint/no-explicit-any
<T = any>(url: string, body?: unknown, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'PATCH', body }),
  delete: // eslint-disable-next-line @typescript-eslint/no-explicit-any
<T = any>(url: string, init: ApiRequestInit = {}): Promise<ApiAxiosLikeResponse<T>> =>
    request<T>(url, { ...init, method: 'DELETE' }),
};

export default api;

export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const axish = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return axish?.response?.data?.error?.message ?? axish?.message ?? 'An unexpected error occurred.';
}
