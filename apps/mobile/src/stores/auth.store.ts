import { create } from 'zustand';
import api, { setAuthSessionExpiredHandler, storage } from '@/services/api';
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
import { unregisterStoredPushToken } from '@/services/push-token.service';
import { resetApplicationSession } from './provider-application-session.store';

// Separate from token rotation and from draft reloads. An old logout may finish
// after a fresh sign-in, including another sign-in by this same account.
let authIdentityGeneration = 0;
function invalidateApplicantIdentity(): void {
  authIdentityGeneration += 1;
  resetApplicationSession();
}

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
  // D23 — `provider_staff` is a team member with their own scoped login.
  role: 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo' | 'provider_staff';
  avatarUrl: string | null;
}

/** D37: answer to "send me a code" (POST /api/v1/auth/email-code/request). */
export interface EmailCodeReceipt {
  challengeId: string;
  /** true when the server re-sent the SAME code inside its window. */
  resent: boolean;
  /** Milliseconds left on the code by the server's clock. */
  expiresInMs: number;
  /** Milliseconds before "Resend" may be used again. */
  resendInMs: number;
  validForMs: number;
  message: string;
  /** 'unknown' when the email provider did not confirm the send. */
  delivery: 'accepted' | 'unknown';
}

/** D37: result of checking an email code. A new email must still create its account. */
export type EmailVerifyOutcome =
  | { status: 'signed_in'; isNewUser: boolean }
  | { status: 'needs_account'; email: string; signupToken: string; signupExpiresInSeconds: number };

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  otpRequestId: string | null;
  // In-memory explanation only, never evidence of an approval or account role.
  sessionExpired: boolean;

  hydrate: () => void;
  requestOtp: (phone: string, captchaToken?: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  register: (phone: string, firstName: string, lastName: string) => Promise<void>;
  // D37 (2026-10-11): email codes replace phone codes while SMS is paused.
  requestEmailCode: (email: string, captchaToken?: string) => Promise<EmailCodeReceipt>;
  verifyEmailCode: (email: string, code: string) => Promise<EmailVerifyOutcome>;
  completeEmailSignup: (input: { signupToken: string; firstName: string; lastName: string; phone: string }) => Promise<void>;
  logout: (reason?: 'sign-in-required') => Promise<void>;
  setUser: (user: User) => void;
  // D23 — after accepting a team invite the API returns a fresh token pair
  // carrying the provider_staff role; swap in the new session so routing
  // re-evaluates to the staff app.
  applyStaffSession: (accessToken: string, refreshToken: string) => void;
}

// Bug 1061 fix: tokens + user PII live in secure-storage (encrypted MMKV
// with OS-keychain-derived key). The non-sensitive `storage` from api.ts
// is still used for transient flags like `isNewUser`. Push-token ownership is
// managed by push-token.service in the separate public storage instance.
//
// All read/write helpers here are SYNCHRONOUS because initSecureStorage()
// is awaited at app boot in apps/mobile/app/_layout.tsx before this store
// is hydrated.
async function fingerprintOrUndefined(): Promise<string | undefined> {
  try {
    return await getDeviceFingerprint();
  } catch {
    return undefined;
  }
}

/**
 * D37: validate a signed-in response from the email-code routes before storing
 * anything, with the same checks verifyOtp applies (MED-K02): never store
 * undefined tokens or mark a user signed in without a user object.
 */
function acceptEmailSession(
  data: { accessToken?: unknown; refreshToken?: unknown; user?: unknown; isNewUser?: unknown } | undefined,
  set: (partial: Partial<AuthState>) => void,
): boolean {
  if (!data) throw new Error('Sign-in returned an unexpected response. Please try again.');
  if (typeof data.accessToken !== 'string' || data.accessToken.length === 0) {
    throw new Error('Sign-in returned no access token. Please try again.');
  }
  if (typeof data.refreshToken !== 'string' || data.refreshToken.length === 0) {
    throw new Error('Sign-in returned no refresh token. Please try again.');
  }
  if (!data.user || typeof data.user !== 'object') {
    throw new Error('Sign-in returned no user object. Please try again.');
  }
  const user = data.user as User;
  const isNewUser = data.isNewUser === true;
  invalidateApplicantIdentity();
  storeTokens(data.accessToken, data.refreshToken);
  storeUser(JSON.stringify(user));
  if (isNewUser) storage.set('isNewUser', 'true');
  set({ user, isAuthenticated: true, otpRequestId: null, sessionExpired: false });
  return isNewUser;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  otpRequestId: null,
  sessionExpired: false,

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

  requestOtp: async (phone: string, captchaToken?: string) => {
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
    // captchaToken is sent only after the server has demanded one (HTTP 428,
    // captchaRequired) following the failed-attempt lockout. The caller obtains
    // it from the Cloudflare Turnstile challenge (see useCaptchaOtp).
    await api.post('/api/v1/auth/send-otp', { phone, deviceFingerprint, captchaToken });
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
    // A fresh login for the same owner also invalidates old screen work.
    invalidateApplicantIdentity();
    storeTokens(accessToken, refreshToken);
    storeUser(JSON.stringify(user));
    if (isNewUser) {
      storage.set('isNewUser', 'true');
    }
    set({ user, isAuthenticated: true, otpRequestId: null, sessionExpired: false });
  },

  register: async (_phone: string, firstName: string, lastName: string) => {
    const token = getAccessToken();
    if (!token) throw new Error('Must verify OTP before completing registration.');
    const res = await api.patch('/api/v1/auth/me', { firstName, lastName });
    const user = res.data.data;
    storeUser(JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  // D37: one-time email proof requests are anonymous: no stored credential is
  // attached, refreshed or replayed (api.ts 'anonymous' mode).
  requestEmailCode: async (email: string, captchaToken?: string) => {
    const deviceFingerprint = await fingerprintOrUndefined();
    const res = await api.post('/api/v1/auth/email-code/request',
      { email, deviceFingerprint, ...(captchaToken ? { captchaToken } : {}) }, { auth: 'anonymous' });
    const data = res.data?.data as Partial<EmailCodeReceipt> | undefined;
    if (!data || typeof data.challengeId !== 'string' || typeof data.expiresInMs !== 'number'
        || typeof data.resendInMs !== 'number') {
      throw new Error('The code request returned an unexpected response. Please try again.');
    }
    return {
      challengeId: data.challengeId,
      resent: data.resent === true,
      expiresInMs: data.expiresInMs,
      resendInMs: data.resendInMs,
      validForMs: typeof data.validForMs === 'number' ? data.validForMs : 300_000,
      message: typeof data.message === 'string' ? data.message : '',
      delivery: data.delivery === 'unknown' ? 'unknown' : 'accepted',
    };
  },

  verifyEmailCode: async (email: string, code: string) => {
    const deviceFingerprint = await fingerprintOrUndefined();
    const res = await api.post('/api/v1/auth/email-code/verify', { email, code, deviceFingerprint }, { auth: 'anonymous' });
    const data = res.data?.data as Record<string, unknown> | undefined;
    if (data?.status === 'needs_account') {
      if (typeof data.signupToken !== 'string' || typeof data.email !== 'string') {
        throw new Error('Sign-in returned an unexpected response. Please try again.');
      }
      return { status: 'needs_account', email: data.email, signupToken: data.signupToken,
        signupExpiresInSeconds: typeof data.signupExpiresInSeconds === 'number' ? data.signupExpiresInSeconds : 1800 };
    }
    const isNewUser = acceptEmailSession(data, set);
    return { status: 'signed_in', isNewUser };
  },

  completeEmailSignup: async ({ signupToken, firstName, lastName, phone }) => {
    const deviceFingerprint = await fingerprintOrUndefined();
    const res = await api.post('/api/v1/auth/email-code/complete-signup',
      { signupToken, firstName, lastName, phone, deviceFingerprint }, { auth: 'anonymous' });
    acceptEmailSession(res.data?.data, set);
  },

  // Phase D CRIT-72 fix — call server /auth/logout to invalidate the
  // refresh token. Pre-fix logout was purely client-side: tokens
  // cleared from secure-storage but the server's refresh_tokens row
  // stayed valid until natural expiry (30 days). A stolen refresh
  // token from the device's secure store could continue to mint
  // access tokens for weeks after the user logged out.
  //
  // Post-fix: start the best-effort push detachment and /auth/logout
  // requests while the current credentials are still available, then clear
  // local state. Running both requests together avoids doubling the logout
  // delay on a poor connection. If either server call fails, we still clear
  // locally; logout must always succeed from the user's perspective.
  logout: async (reason) => {
    const generation = authIdentityGeneration;
    const logoutRequests: Promise<unknown>[] = [unregisterStoredPushToken()];
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      logoutRequests.push(api.post('/api/v1/auth/logout', { refreshToken }));
    }
    await Promise.allSettled(logoutRequests);
    if (authIdentityGeneration !== generation) return;
    clearTokens();
    clearStoredUser();
    set({ user: null, isAuthenticated: false, otpRequestId: null, sessionExpired: reason === 'sign-in-required' });
  },

  setUser: (user: User) => {
    storeUser(JSON.stringify(user));
    set({ user });
  },

  applyStaffSession: (accessToken: string, refreshToken: string) => {
    storeTokens(accessToken, refreshToken);
    set((state) => {
      const user = state.user ? { ...state.user, role: 'provider_staff' as const } : state.user;
      if (user) storeUser(JSON.stringify(user));
      return { user, isAuthenticated: true, sessionExpired: false };
    });
  },
}));

// The fetch wrapper cannot import this store without creating a circular
// dependency. Register a one-way callback so a terminal refresh failure also
// updates live UI state; secure-storage has already been cleared at that point.
setAuthSessionExpiredHandler(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    otpRequestId: null,
    sessionExpired: true,
  });
});

// One boundary covers logout, terminal expiry, restored identity, approval,
// staff conversion and explicit account changes. Profile-only edits keep work.
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.user?.role !== previous.user?.role
    || state.isAuthenticated !== previous.isAuthenticated) invalidateApplicantIdentity();
});
