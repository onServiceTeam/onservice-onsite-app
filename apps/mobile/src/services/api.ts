import axios from 'axios';
import { platformConfig } from '@/config/platform.config';

let mmkvInstance: { getString: (k: string) => string | undefined; set: (k: string, v: string | boolean) => void; delete: (k: string) => void; getBoolean: (k: string) => boolean | undefined } | null = null;

function initStorage(): void {
  if (mmkvInstance) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv');
    mmkvInstance = new MMKV({ id: 'onservice-auth', encryptionKey: undefined });
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
  const token = storage.getString('accessToken');
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
      const refreshToken = storage.getString('refreshToken');

      if (refreshToken) {
        try {
          const res = await axios.post(`${platformConfig.apiUrl}/api/v1/auth/refresh-token`, {
            refreshToken,
          });
          const { accessToken, refreshToken: newRefresh } = res.data.data;
          storage.set('accessToken', accessToken);
          if (newRefresh) storage.set('refreshToken', newRefresh);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch {
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
