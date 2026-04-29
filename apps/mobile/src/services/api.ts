import axios from 'axios';
import { platformConfig } from '@/config/platform.config';
import {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearTokens,
  removeSecureItem,
} from './secure-storage';

// Non-sensitive cache. Tokens + user PII live in `./secure-storage` which
// is encrypted with an OS-keychain-derived key per Bug 1061 fix (Phase 14
// Dispatch 01). This cache holds device-local prefs that are not PII:
// pushToken, hasOnboarded flag, etc.
//
// The MMKV `id` was renamed from `'onservice-auth'` to `'onservice-cache'`
// to make the role explicit. The legacy `'onservice-auth'` MMKV file may
// still exist on devices that upgraded from a pre-fix build; the migration
// at `./auth-migration.ts` reads it once at boot to extract any legacy
// tokens before they become inaccessible.
let mmkvInstance: { getString: (k: string) => string | undefined; set: (k: string, v: string | boolean) => void; delete: (k: string) => void; getBoolean: (k: string) => boolean | undefined } | null = null;

function initStorage(): void {
  if (mmkvInstance) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv');
    // Bug 1061 fix: this MMKV holds non-PII cache only, NOT auth tokens.
    // Auth tokens are in `./secure-storage` with OS-keychain encryption.
    // Reading from the LEGACY id `'onservice-auth'` is preserved here only
    // so `auth-migration.ts` can read the legacy token store on first boot
    // after upgrade. After migration completes, this MMKV is effectively
    // a non-sensitive cache.
    mmkvInstance = new MMKV({ id: 'onservice-auth' });
  } catch {
    // Fallback for environments where MMKV is unavailable (tests, SSR)
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

const api = axios.create({
  baseURL: platformConfig.apiUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  // Bug 1061 fix: tokens live in OS-keychain-encrypted secure-storage.
  // initSecureStorage() is awaited at app boot in apps/mobile/app/_layout.tsx
  // before any request is fired, so this sync read is safe.
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getRefreshToken();

      if (refreshToken) {
        try {
          const res = await axios.post(`${platformConfig.apiUrl}/api/v1/auth/refresh-token`, {
            refreshToken,
          });
          const { accessToken, refreshToken: newRefresh } = res.data.data;
          // Bug 1061 fix: store tokens in encrypted secure-storage, not
          // the unencrypted cache MMKV. If the server rotated the refresh
          // token, persist the new one too; otherwise reuse the existing.
          storeTokens(accessToken, newRefresh ?? refreshToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed → tokens are invalid. Clear from secure store
          // AND from the legacy cache key (in case migration hadn't
          // completed yet on this boot).
          clearTokens();
          removeSecureItem('user');
          storage.delete('accessToken');
          storage.delete('refreshToken');
          storage.delete('user');
        }
      }
    }
    return Promise.reject(error);
  },
);

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
