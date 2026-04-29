// apps/admin/src/lib/api.ts
//
// Bug 1251 fix: admin auth no longer keeps tokens in localStorage. Three cookies:
//   admin_session — HttpOnly, browser sends automatically on /api requests.
//   admin_refresh — HttpOnly, scoped to /api/v1/auth/admin/refresh.
//   admin_csrf    — JS-readable, value echoed in X-CSRF-Token on every write.
//
// Threat model: an XSS payload that fetches /api/v1/admin/<x> with the same-
// origin cookies WILL fail without a matching CSRF header — and the CSRF token
// is rotated on every refresh, so even a token captured one hour ago is dead
// after the next refresh boundary. SameSite=Strict on the session cookie
// closes the cross-origin CSRF surface.

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
  // Send cookies on same-origin requests. Required for admin_session.
  withCredentials: true,
});

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)admin_csrf=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

const SAFE_METHODS = new Set(['get', 'head', 'options']);

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) {
      config.headers.set('X-CSRF-Token', csrf);
    }
  }
  return config;
});

interface RetryConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = (error.config ?? {}) as RetryConfig;
    const status = error.response?.status;
    // Don't loop on the refresh endpoint itself.
    const isRefresh = original.url?.endsWith('/api/v1/auth/admin/refresh') ?? false;

    if (status === 401 && !original._retry && !isRefresh) {
      original._retry = true;
      try {
        await axios.post('/api/v1/auth/admin/refresh', {}, { withCredentials: true });
        return api(original as InternalAxiosRequestConfig);
      } catch {
        // Refresh failed — kick to login.
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export function getErrorMessage(err: unknown): string {
  const axErr = err as { response?: { data?: { error?: { message?: string } } } };
  return axErr?.response?.data?.error?.message ?? 'An unexpected error occurred.';
}
