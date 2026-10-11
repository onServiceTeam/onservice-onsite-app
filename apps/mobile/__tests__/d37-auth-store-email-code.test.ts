// D37 (Ken, 2026-10-11): the real auth store's email-code actions. Only the
// network client, secure storage and device fingerprint are substituted.

const mockPost = jest.fn();
const mockStoreTokens = jest.fn();
const mockStoreUser = jest.fn();
const mockStorageSet = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockPost(...args), get: jest.fn() },
  setAuthSessionExpiredHandler: jest.fn(),
  storage: { set: (...args: unknown[]) => mockStorageSet(...args), delete: jest.fn() },
}));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  storeTokens: (...args: unknown[]) => mockStoreTokens(...args),
  clearTokens: jest.fn(),
  getStoredUser: jest.fn(),
  storeUser: (...args: unknown[]) => mockStoreUser(...args),
  clearStoredUser: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: jest.fn().mockResolvedValue('device-d37') }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn().mockResolvedValue(undefined) }));
jest.unmock('@/stores/auth.store');

import { useAuthStore } from '@/stores/auth.store';

const user = { id: 'user-1', phone: '+639171234567', email: 'juan@gmail.com', firstName: 'Juan', lastName: 'Cruz',
  role: 'customer', avatarUrl: null, isVerified: true };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, sessionExpired: true });
});

it('D37 - asking for a code is an anonymous request that returns the server timing', async () => {
  mockPost.mockResolvedValue({ data: { data: { challengeId: 'c-1', resent: true, expiresInMs: 123456, resendInMs: 30000,
    validForMs: 300000, message: 'We sent the same code again.' } } });
  const receipt = await useAuthStore.getState().requestEmailCode('juan@gmail.com');
  expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/email-code/request',
    { email: 'juan@gmail.com', deviceFingerprint: 'device-d37' }, { auth: 'anonymous' });
  expect(receipt).toEqual({ challengeId: 'c-1', resent: true, expiresInMs: 123456, resendInMs: 30000,
    validForMs: 300000, message: 'We sent the same code again.', delivery: 'accepted' });
  // The provider did not confirm: the app is told, so it can say so.
  mockPost.mockResolvedValueOnce({ data: { data: { challengeId: 'c-1', resent: false, expiresInMs: 300000, resendInMs: 30000,
    delivery: 'unknown' } } });
  expect((await useAuthStore.getState().requestEmailCode('juan@gmail.com')).delivery).toBe('unknown');
  await useAuthStore.getState().requestEmailCode('juan@gmail.com', 'captcha-token');
  expect(mockPost).toHaveBeenLastCalledWith('/api/v1/auth/email-code/request',
    { email: 'juan@gmail.com', deviceFingerprint: 'device-d37', captchaToken: 'captcha-token' }, { auth: 'anonymous' });
});

it('D37 - a malformed code receipt fails instead of starting a countdown', async () => {
  mockPost.mockResolvedValue({ data: { data: { challengeId: 'c-1' } } });
  await expect(useAuthStore.getState().requestEmailCode('juan@gmail.com')).rejects.toThrow('unexpected response');
});

it('D37 - the right code stores the session; a new email stores nothing and asks to create the account', async () => {
  mockPost.mockResolvedValueOnce({ data: { data: { status: 'needs_account', email: 'new@gmail.com',
    signupToken: 'signup-token', signupExpiresInSeconds: 1800 } } });
  await expect(useAuthStore.getState().verifyEmailCode('new@gmail.com', '123456')).resolves.toEqual({
    status: 'needs_account', email: 'new@gmail.com', signupToken: 'signup-token', signupExpiresInSeconds: 1800 });
  expect(mockStoreTokens).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);

  mockPost.mockResolvedValueOnce({ data: { data: { status: 'signed_in', accessToken: 'access', refreshToken: 'refresh',
    user, isNewUser: false, isNewDevice: true } } });
  await expect(useAuthStore.getState().verifyEmailCode('juan@gmail.com', '654321'))
    .resolves.toEqual({ status: 'signed_in', isNewUser: false });
  expect(mockPost).toHaveBeenLastCalledWith('/api/v1/auth/email-code/verify',
    { email: 'juan@gmail.com', code: '654321', deviceFingerprint: 'device-d37' }, { auth: 'anonymous' });
  expect(mockStoreTokens).toHaveBeenCalledWith('access', 'refresh');
  expect(mockStoreUser).toHaveBeenCalledWith(JSON.stringify(user));
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, sessionExpired: false, user });
});

it('D37 - a signed-in answer without tokens never marks anyone signed in', async () => {
  for (const data of [undefined, { status: 'signed_in', refreshToken: 'r', user }, { status: 'signed_in', accessToken: 'a', user },
    { status: 'signed_in', accessToken: 'a', refreshToken: 'r' }]) {
    mockPost.mockResolvedValueOnce({ data: { data } });
    await expect(useAuthStore.getState().verifyEmailCode('juan@gmail.com', '654321')).rejects.toThrow();
  }
  expect(mockStoreTokens).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});

it('D37 - finishing sign-up stores the new session and marks the user as new', async () => {
  mockPost.mockResolvedValue({ data: { data: { status: 'signed_in', accessToken: 'access-2', refreshToken: 'refresh-2',
    user, isNewUser: true } } });
  await useAuthStore.getState().completeEmailSignup({ signupToken: 'signup-token', firstName: 'Juan', lastName: 'Cruz',
    phone: '+639171234567' });
  expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/email-code/complete-signup', { signupToken: 'signup-token',
    firstName: 'Juan', lastName: 'Cruz', phone: '+639171234567', deviceFingerprint: 'device-d37' }, { auth: 'anonymous' });
  expect(mockStoreTokens).toHaveBeenCalledWith('access-2', 'refresh-2');
  expect(mockStorageSet).toHaveBeenCalledWith('isNewUser', 'true');
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
});
