// Phase K CRIT-K01 / K10 / K11 / K12 — mobile-app fix verification.
//
// These are SOURCE-SHAPE tests against the post-fix files. They are
// NOT render tests (per the apps/mobile R5b note about react-test-
// renderer 19 + jest-expo preset compatibility issues — see
// proof/phone-validation.real.test.ts header). They verify the
// concrete diff: API paths, deprecation throws, role-flip removal.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAYMENT_SVC = readFileSync(
  resolve(__dirname, '../src/services/payment.service.ts'),
  'utf8',
);
const USE_WALLET = readFileSync(
  resolve(__dirname, '../src/hooks/useWallet.ts'),
  'utf8',
);
const SECURE_LEGACY = readFileSync(
  resolve(__dirname, '../src/services/secure-storage.service.ts'),
  'utf8',
);
const SECURE_NEW = readFileSync(
  resolve(__dirname, '../src/services/secure-storage.ts'),
  'utf8',
);
const FINGERPRINT = readFileSync(
  resolve(__dirname, '../src/services/device-fingerprint.service.ts'),
  'utf8',
);
const TERMS = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/terms.tsx'),
  'utf8',
);

describe('Phase K CRIT-K11 — wallet API path is /api/v1/wallet (singular)', () => {
  it('CRIT-K11 — payment.service uses /api/v1/wallet (NOT /api/v1/wallets)', () => {
    expect(PAYMENT_SVC).toMatch(/'\/api\/v1\/wallet'/);
    expect(PAYMENT_SVC).not.toMatch(/'\/api\/v1\/wallets'/);
  });
  it('CRIT-K11 — payment.service top-up uses /api/v1/wallet/top-up (singular)', () => {
    expect(PAYMENT_SVC).toMatch(/'\/api\/v1\/wallet\/top-up'/);
    expect(PAYMENT_SVC).not.toMatch(/'\/api\/v1\/wallets\/top-up'/);
  });
  it('CRIT-K11 — useWallet balance read hits /api/v1/wallet (NOT /api/v1/wallet/balance)', () => {
    expect(USE_WALLET).toMatch(/get<ApiResponse<WalletBalance>>\('\/api\/v1\/wallet'\)/);
    expect(USE_WALLET).not.toMatch(/'\/api\/v1\/wallet\/balance'/);
  });
});

describe('Phase K CRIT-K12 — wallet shape is camelCase (matches backend formatWallet)', () => {
  it('CRIT-K12 — useWallet WalletBalance interface uses availableBalance + pendingBalance', () => {
    expect(USE_WALLET).toMatch(/availableBalance: number/);
    expect(USE_WALLET).toMatch(/pendingBalance: number/);
  });
  it('CRIT-K12 — useWallet WalletBalance no longer has snake_case', () => {
    // Match snake_case fields as type members specifically.
    expect(USE_WALLET).not.toMatch(/available_balance: number/);
    expect(USE_WALLET).not.toMatch(/pending_balance: number/);
  });
  it('CRIT-K12 — useWallet exposes availableBalance + pendingBalance in return shape', () => {
    expect(USE_WALLET).toMatch(/availableBalance: walletQuery\.data\?\.balance\?\.availableBalance/);
    expect(USE_WALLET).toMatch(/pendingBalance: walletQuery\.data\?\.balance\?\.pendingBalance/);
  });
  it('CRIT-K12 — payment.service WalletBalance also camelCase', () => {
    expect(PAYMENT_SVC).toMatch(/availableBalance: number/);
    expect(PAYMENT_SVC).toMatch(/pendingBalance: number/);
  });
});

describe('Phase K CRIT-K01 — legacy secure-storage hardcoded key API throws', () => {
  it('CRIT-K01 — hardcoded "onservice-dev-only-key" string removed from legacy module', () => {
    expect(SECURE_LEGACY).not.toMatch(/'onservice-dev-only-key'/);
  });
  it('CRIT-K01 — getSecureItem/setSecureItem now throw via deprecated()', () => {
    expect(SECURE_LEGACY).toMatch(/function deprecated\(\): never/);
    expect(SECURE_LEGACY).toMatch(/export function setSecureItem\(_key: string, _value: string\): void \{\s*\n\s*deprecated\(\);/);
    expect(SECURE_LEGACY).toMatch(/export function getSecureItem\(_key: string\): string \| undefined \{\s*\n\s*return deprecated\(\);/);
  });
  it('CRIT-K01 — token helpers (storeTokens/getAccessToken/getRefreshToken/clearTokens) all throw deprecated', () => {
    expect(SECURE_LEGACY).toMatch(/export function storeTokens\(_a: string, _r: string\): void \{\s*\n\s*deprecated\(\);/);
    expect(SECURE_LEGACY).toMatch(/export function getAccessToken\(\): string \| undefined \{\s*\n\s*return deprecated\(\);/);
    expect(SECURE_LEGACY).toMatch(/export function getRefreshToken\(\): string \| undefined \{\s*\n\s*return deprecated\(\);/);
  });
  it('CRIT-K01 — publicStorage helpers (setPublicItem/getPublicItem) PRESERVED for non-PII state', () => {
    expect(SECURE_LEGACY).toMatch(/export function setPublicItem\(key: string, value: string\): void \{\s*\n\s*publicStorage\.set\(key, value\);/);
    expect(SECURE_LEGACY).toMatch(/export function getPublicItem\(key: string\): string \| undefined \{\s*\n\s*return publicStorage\.getString\(key\);/);
  });
  it('CRIT-K01 — canonical secure-storage.ts uses keychain (expo-secure-store) for the key', () => {
    expect(SECURE_NEW).toMatch(/import \* as SecureStore from 'expo-secure-store'/);
    expect(SECURE_NEW).toMatch(/await SecureStore\.setItemAsync\(ENCRYPTION_KEY_NAME, key/);
  });
  it('CRIT-K01 — device-fingerprint.service migrated from legacy to canonical secure-storage', () => {
    expect(FINGERPRINT).toMatch(/from '\.\/secure-storage'/);
    expect(FINGERPRINT).not.toMatch(/from '\.\/secure-storage\.service'/);
  });
});

describe('Phase K CRIT-K10 — terms.tsx no longer flips role to provider on submit', () => {
  it('CRIT-K10 — setUser is no longer called with role=provider', () => {
    expect(TERMS).not.toMatch(/setUser\(\{ \.\.\.user, role: 'provider' \}\)/);
  });
  it('CRIT-K10 — useAuthStore import removed (no auth store mutation in this file)', () => {
    expect(TERMS).not.toMatch(/import \{ useAuthStore \} from '@\/stores\/auth\.store'/);
  });
  it('CRIT-K10 — fix comment present at the onSuccess handler', () => {
    expect(TERMS).toMatch(/Phase K CRIT-K10 fix — DO NOT flip role to 'provider' before/);
  });
  it('CRIT-K10 — REVIEW_PENDING navigation still happens (correct landing post-submit)', () => {
    expect(TERMS).toMatch(/router\.replace\(Routes\.PROVIDER_ONBOARDING\.REVIEW_PENDING\)/);
  });
});
