/**
 * Phase 14 R5b — jest setup.
 *
 * Mocks the project-internal modules that have side effects (api,
 * secure-storage, auth-store) so component tests can render screens
 * without hitting network or real storage.
 *
 * Module-level stubs for react-native, expo-*, sentry, lucide-react-native,
 * etc. live in __mocks__/ and are wired via jest.config.js's
 * moduleNameMapper.
 */

// __DEV__ global RN normally provides at build time.
globalThis.__DEV__ = true;

// react-native-webview ships untransformed ESM; stub it so screens that mount
// the Turnstile captcha sheet (login/register) render in tests without it.
jest.mock('react-native-webview', () => ({ WebView: () => null }));

// Project-internal services.
jest.mock('@/services/api', () => {
  // Minimal stand-in so utils/errors getErrorMessage's `instanceof ApiError`
  // check works in tests that drive real error paths.
  class ApiError extends Error {
    constructor(status, body, fallback) {
      super(body?.error?.message ?? fallback);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return {
    __esModule: true,
    ApiError,
    default: {
      get: jest.fn().mockResolvedValue({ data: {} }),
      post: jest.fn().mockResolvedValue({ data: {} }),
      put: jest.fn().mockResolvedValue({ data: {} }),
      patch: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({ data: {} }),
    },
  };
});

jest.mock('@/services/secure-storage', () => ({
  initSecureStorage: jest.fn().mockResolvedValue(undefined),
  getSecureItem: jest.fn(),
  setSecureItem: jest.fn(),
  removeSecureItem: jest.fn(),
  getAccessToken: jest.fn().mockReturnValue(undefined),
  getRefreshToken: jest.fn().mockReturnValue(undefined),
  storeTokens: jest.fn(),
  clearTokens: jest.fn(),
  getStoredUser: jest.fn().mockReturnValue(undefined),
}));

jest.mock('@/stores/auth.store', () => {
  const requestOtp = jest.fn().mockResolvedValue(undefined);
  const verifyOtp = jest.fn().mockResolvedValue(undefined);
  const logout = jest.fn();
  const hydrate = jest.fn();
  const useAuthStore = (selector) => {
    const state = {
      isAuthenticated: false,
      user: null,
      requestOtp,
      verifyOtp,
      logout,
      hydrate,
    };
    return selector ? selector(state) : state;
  };
  useAuthStore.getState = () => ({
    isAuthenticated: false,
    user: null,
    requestOtp,
    verifyOtp,
    logout,
    hydrate,
  });
  return { useAuthStore };
});
