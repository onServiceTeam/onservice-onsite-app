// apps/mobile/src/services/secure-storage.ts
//
// Encrypted MMKV-backed storage for auth tokens and user PII.
// Bug 1061 (Phase 14 Dispatch 01) full fix.
//
// Design:
//   1. The MMKV encryption key is generated per-device (32 random bytes,
//      base64-encoded) on first launch and stored in the OS-level secure
//      enclave via expo-secure-store (iOS Keychain / Android Keystore).
//   2. The key never appears in plaintext outside the OS keychain.
//   3. Subsequent launches read the existing key from the OS keychain.
//   4. A stolen device cannot read the MMKV file without unlocking the
//      keychain (which requires biometric / passcode unlock per
//      WHEN_UNLOCKED_THIS_DEVICE_ONLY).
//
// API model:
//   - initSecureStorage() is async and MUST be awaited at app boot
//     (apps/mobile/app/_layout.tsx) before any token read or write.
//   - After init resolves, all read/write helpers are SYNCHRONOUS.
//     This keeps existing sync auth-store callers working.
//
// Replaces the previous secure-storage.service.ts implementation that
// used a hardcoded fallback key (`'onservice-dev-only-key'`) — the
// same key for every install, the actual Bug 1061 vulnerability.
// The other secure-storage.service.ts at id `onservice-secure` is left
// in place for non-PII data (device fingerprint, accessibility prefs);
// this new file at id `onservice-auth-secure` holds tokens + user PII
// only.

import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_NAME = 'onservice-mmkv-auth-key-v1';
const KEY_LENGTH_BYTES = 32;

let secureMmkv: MMKV | null = null;

/**
 * Generate or retrieve the MMKV encryption key from the OS keychain.
 * The key never appears in plaintext outside SecureStore.
 */
async function getOrCreateEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);
  if (key) return key;

  // Generate new key — 32 random bytes
  const bytes = new Uint8Array(KEY_LENGTH_BYTES);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback via expo-crypto (test runners and older runtimes)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoCrypto = require('expo-crypto') as { getRandomBytesAsync: (n: number) => Promise<Uint8Array> };
    const generated = await expoCrypto.getRandomBytesAsync(KEY_LENGTH_BYTES);
    bytes.set(generated);
  }

  // base64-encode — prefer btoa, fall back to Buffer for Node test runner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalAny = globalThis as any;
  let encoded: string;
  if (typeof globalAny.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    encoded = globalAny.btoa(binary);
  } else if (typeof globalAny.Buffer !== 'undefined') {
    encoded = globalAny.Buffer.from(bytes).toString('base64');
  } else {
    throw new Error('No base64 encoder available in this runtime');
  }
  key = encoded;

  await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

/**
 * Initialize encrypted secure storage. MUST be awaited at app boot via
 * apps/mobile/app/_layout.tsx BEFORE any token read or write. Subsequent
 * calls return immediately because the cached MMKV instance is reused.
 *
 * On first launch (no key in keychain): generates a new key, stores it,
 * creates the MMKV instance.
 *
 * On subsequent launches: retrieves the existing key, creates the MMKV
 * instance.
 */
export async function initSecureStorage(): Promise<void> {
  if (secureMmkv) return;
  const encryptionKey = await getOrCreateEncryptionKey();
  secureMmkv = new MMKV({
    id: 'onservice-auth-secure',
    encryptionKey,
  });
}

/**
 * Test-only export to reset module state between tests.
 * Production code MUST NOT call this.
 */
export function __resetForTests(): void {
  secureMmkv = null;
}

function ensureInitialized(): MMKV {
  if (!secureMmkv) {
    throw new Error(
      'secure-storage not initialized — await initSecureStorage() at app boot before any read/write. ' +
        'See apps/mobile/app/_layout.tsx for the canonical boot sequence.',
    );
  }
  return secureMmkv;
}

// Sync accessors. All callers must have awaited initSecureStorage() at boot.

export function getSecureItem(key: string): string | undefined {
  return ensureInitialized().getString(key);
}

export function setSecureItem(key: string, value: string): void {
  ensureInitialized().set(key, value);
}

export function removeSecureItem(key: string): void {
  ensureInitialized().delete(key);
}

// Auth-token convenience helpers — used by api.ts request/response interceptors
// and by stores/auth.store.ts.

export function getAccessToken(): string | undefined {
  return getSecureItem('accessToken');
}

export function getRefreshToken(): string | undefined {
  return getSecureItem('refreshToken');
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  setSecureItem('accessToken', accessToken);
  setSecureItem('refreshToken', refreshToken);
}

export function clearTokens(): void {
  removeSecureItem('accessToken');
  removeSecureItem('refreshToken');
}

// User-record helpers (user object contains phone + email + name = PII).

export function getStoredUser(): string | undefined {
  return getSecureItem('user');
}

export function storeUser(userJson: string): void {
  setSecureItem('user', userJson);
}

export function clearStoredUser(): void {
  removeSecureItem('user');
}
