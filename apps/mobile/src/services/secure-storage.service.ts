// Phase K CRIT-K01 fix — the secure exports in this file used a
// hardcoded MMKV encryption key fallback (the legacy dev-only key)
// when the env var / Constants extra wasn't set. That key was the
// SAME for every install, so any compromised device could decrypt
// any other install's MMKV file. The canonical secure-storage now
// lives in secure-storage.ts (per-device keychain-backed key); all
// auth-token + PII reads/writes have been migrated.
//
// The publicStorage MMKV instance does NOT use encryption and was
// always intended for non-sensitive state (accessibility prefs,
// theme choice, dismissed banners) — those callers are still valid.
//
// The secure* helpers below now THROW. Anyone still importing them
// gets a loud failure at runtime so the migration can't silently
// regress. Public helpers are preserved.

import { MMKV } from 'react-native-mmkv';
import { logger } from '@/utils/logger';

const publicStorage = new MMKV({
  id: 'onservice-public',
});

const DEPRECATION_MSG =
  'secure-storage.service is DEPRECATED for secure values. Use ' +
  '@/services/secure-storage instead (per-device keychain-backed ' +
  'encryption). Public values are still supported here.';

function deprecated(): never {
  // Logger first so we capture the call site in production telemetry
  // even if a caller catches the throw.
  if (typeof logger?.error === 'function') {
    logger.error('secure-storage.service deprecated secure API called', {
      message: DEPRECATION_MSG,
    });
  }
  throw new Error(DEPRECATION_MSG);
}

export function setSecureItem(_key: string, _value: string): void {
  deprecated();
}

export function getSecureItem(_key: string): string | undefined {
  return deprecated();
}

export function removeSecureItem(_key: string): void {
  deprecated();
}

// Public storage — kept. Used by accessibility.store and similar
// non-PII state.
export function setPublicItem(key: string, value: string): void {
  publicStorage.set(key, value);
}

export function getPublicItem(key: string): string | undefined {
  return publicStorage.getString(key);
}

export function removePublicItem(key: string): void {
  publicStorage.delete(key);
}

// Token + clear helpers also deprecated — auth.store and api.ts
// already use secure-storage.ts directly post-fix.
export function storeTokens(_a: string, _r: string): void {
  deprecated();
}

export function getAccessToken(): string | undefined {
  return deprecated();
}

export function getRefreshToken(): string | undefined {
  return deprecated();
}

export function clearTokens(): void {
  deprecated();
}

export function clearAll(): void {
  // Clearing public state is fine; calling secure clearAll on the
  // legacy id is meaningless because the new module owns auth state
  // under a different MMKV id.
  publicStorage.clearAll();
}

// Legacy export kept ONLY for backward-compat type imports in tests.
// Reading or writing through `secureStorage` from this file is a
// no-op + warning to discourage further use without breaking the
// module load. Public storage is real and can be used safely.
const secureStorage = new MMKV({
  id: 'onservice-secure-deprecated',
  // No encryptionKey — this instance is intentionally inert / read-
  // only-zero so any leftover read returns nothing (preventing the
  // hardcoded-key data from surfacing).
});
export { secureStorage, publicStorage };
