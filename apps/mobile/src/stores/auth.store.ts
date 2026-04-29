import { create } from 'zustand';
import api, { storage } from '@/services/api';
import {
  getAccessToken,
  storeTokens,
  clearTokens,
  getStoredUser,
  storeUser,
  clearStoredUser,
} from '@/services/secure-storage';

export interface User {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: 'customer' | 'provider' | 'admin';
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  otpRequestId: string | null;

  hydrate: () => void;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  register: (phone: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

// Bug 1061 fix: tokens + user PII live in secure-storage (encrypted MMKV
// with OS-keychain-derived key). The non-sensitive `storage` from api.ts
// is still used for transient flags like `isNewUser` and `pushToken`.
//
// All read/write helpers here are SYNCHRONOUS because initSecureStorage()
// is awaited at app boot in apps/mobile/app/_layout.tsx before this store
// is hydrated.
export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  otpRequestId: null,

  hydrate: () => {
    const token = getAccessToken();
    const userJson = getStoredUser();
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as User;
        set({ user, isAuthenticated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  requestOtp: async (phone: string) => {
    await api.post('/api/v1/auth/send-otp', { phone });
    set({ otpRequestId: phone });
  },

  verifyOtp: async (phone: string, code: string) => {
    const res = await api.post('/api/v1/auth/verify-otp', { phone, code });
    const { accessToken, refreshToken, user, isNewUser } = res.data.data;
    storeTokens(accessToken, refreshToken);
    storeUser(JSON.stringify(user));
    if (isNewUser) {
      storage.set('isNewUser', 'true');
    }
    set({ user, isAuthenticated: true, otpRequestId: null });
  },

  register: async (_phone: string, firstName: string, lastName: string) => {
    const token = getAccessToken();
    if (!token) throw new Error('Must verify OTP before completing registration.');
    const res = await api.patch('/api/v1/auth/me', { firstName, lastName });
    const user = res.data.data;
    storeUser(JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    clearTokens();
    clearStoredUser();
    storage.delete('pushToken');
    set({ user: null, isAuthenticated: false, otpRequestId: null });
  },

  setUser: (user: User) => {
    storeUser(JSON.stringify(user));
    set({ user });
  },
}));
