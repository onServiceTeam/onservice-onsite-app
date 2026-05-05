import { create } from 'zustand';
import api, { storage } from '@/services/api';
import {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearTokens,
  getStoredUser,
  storeUser,
  clearStoredUser,
} from '@/services/secure-storage';
// BUG-PHASE127-01 fix — wire device-fingerprint.service into the
// auth flow. Pre-fix the service existed (with secure-storage
// migration via CRIT-K01) but had ZERO consumers — so the MED-N85
// refresh-token binding feature on the API side was always falling
// through to the no-bind path because mobile never sent
// deviceFingerprint with /auth/send-otp or /auth/verify-otp. (Even
// if it had, the auth.validators.ts schemas were stripping the
// field — fixed in the same phase.) Now mobile generates the
// fingerprint at sign-in and sends it; the API binds the issued
// refresh_tokens.device_fingerprint, and a future stolen-token
// refresh attempt from a different fingerprint can be detected.
import { getDeviceFingerprint } from '@/services/device-fingerprint.service';

// Phase D CRIT-88 fix — User.role no longer omits 'super_admin' (and
// 'dpo' from E01). Pre-fix: a super_admin signing into the mobile
// app cast through `as 'admin'` somewhere downstream and lost the
// 'super_admin' privilege at the type boundary. Now the union
// matches the backend (packages/api types/user.types.ts).
export interface User {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo';
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
    // BUG-PHASE127-01 fix — wire device fingerprint. Best-effort:
    // if the fingerprint generation fails (e.g. expo-application
    // unavailable in some test/dev environments), fall through to
    // sending without it — the API treats deviceFingerprint as
    // optional and skips the binding when absent.
    let deviceFingerprint: string | undefined;
    try {
      deviceFingerprint = await getDeviceFingerprint();
    } catch {
      deviceFingerprint = undefined;
    }
    await api.post('/api/v1/auth/send-otp', { phone, deviceFingerprint });
    set({ otpRequestId: phone });
  },

  verifyOtp: async (phone: string, code: string) => {
    let deviceFingerprint: string | undefined;
    try {
      deviceFingerprint = await getDeviceFingerprint();
    } catch {
      deviceFingerprint = undefined;
    }
    const res = await api.post('/api/v1/auth/verify-otp', { phone, code, deviceFingerprint });
    // Phase K MED-K02 fix — validate the response shape before
    // trusting it. Pre-fix the destructure assumed `res.data.data`
    // contained accessToken / refreshToken / user / isNewUser; if
    // the backend returned `{success: false, error: ...}` (or 200
    // with a different shape due to a route change), we'd silently
    // call storeTokens(undefined, undefined), corrupt secure-storage,
    // and `set({ user: undefined, isAuthenticated: true })` — a
    // signed-in user with NO user object.
    const data = res.data?.data as
      | { accessToken?: unknown; refreshToken?: unknown; user?: unknown; isNewUser?: unknown }
      | undefined;
    if (!data) {
      throw new Error('OTP verification returned an unexpected response. Please try again.');
    }
    if (typeof data.accessToken !== 'string' || data.accessToken.length === 0) {
      throw new Error('OTP verification returned no access token. Please try again.');
    }
    if (typeof data.refreshToken !== 'string' || data.refreshToken.length === 0) {
      throw new Error('OTP verification returned no refresh token. Please try again.');
    }
    if (!data.user || typeof data.user !== 'object') {
      throw new Error('OTP verification returned no user object. Please try again.');
    }
    const accessToken = data.accessToken;
    const refreshToken = data.refreshToken;
    const user = data.user as User;
    const isNewUser = data.isNewUser === true;
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

  // Phase D CRIT-72 fix — call server /auth/logout to invalidate the
  // refresh token. Pre-fix logout was purely client-side: tokens
  // cleared from secure-storage but the server's refresh_tokens row
  // stayed valid until natural expiry (30 days). A stolen refresh
  // token from the device's secure store could continue to mint
  // access tokens for weeks after the user logged out.
  //
  // Post-fix: best-effort POST /auth/logout with the refresh token
  // BEFORE clearing local state. Server-side logout deletes the
  // refresh_tokens row + revokes any device-bound state. If the
  // server call fails (network down, 5xx), we still clear locally —
  // logout must always succeed from the user's perspective.
  logout: async () => {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await api.post('/api/v1/auth/logout', { refreshToken });
      }
    } catch {
      // Network/server error — proceed with local clear anyway.
    }
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
