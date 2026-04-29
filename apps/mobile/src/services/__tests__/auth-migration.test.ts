// Bug 1061 fix verified — Phase 14 Dispatch 01.
//
// Tests the auth-migration.ts module that copies legacy unencrypted
// tokens from the old api.ts MMKV (id `onservice-auth`,
// `encryptionKey: undefined`) to the new encrypted secure-storage
// (id `onservice-auth-secure`, OS-keychain-derived key).
//
// The test isolates auth-migration from the real MMKV by mocking the
// `./api` storage export and the `./secure-storage` module surface.

const mockLegacyStore = new Map<string, string>();
const mockSecureStore = new Map<string, string>();

jest.mock('../api', () => ({
  storage: {
    getString: (k: string) => mockLegacyStore.get(k),
    set: (k: string, v: string) => {
      mockLegacyStore.set(k, String(v));
    },
    delete: (k: string) => {
      mockLegacyStore.delete(k);
    },
    getBoolean: (k: string) => {
      const v = mockLegacyStore.get(k);
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
  },
}));

jest.mock('../secure-storage', () => ({
  getSecureItem: (k: string) => mockSecureStore.get(k),
  setSecureItem: (k: string, v: string) => {
    mockSecureStore.set(k, v);
  },
  removeSecureItem: (k: string) => {
    mockSecureStore.delete(k);
  },
}));

// Import AFTER mocks are set up.
import { migrateLegacyTokensIfNeeded } from '../auth-migration';

describe('auth-migration (Bug 1061 — legacy token migration to encrypted store)', () => {
  beforeEach(() => {
    mockLegacyStore.clear();
    mockSecureStore.clear();
  });

  it('migrates accessToken, refreshToken, and user from legacy to secure store', async () => {
    mockLegacyStore.set('accessToken', 'legacy-access-token-jwt');
    mockLegacyStore.set('refreshToken', 'legacy-refresh-token-jwt');
    mockLegacyStore.set('user', JSON.stringify({ id: 'u1', phone: '+639171234567' }));

    const result = await migrateLegacyTokensIfNeeded();

    expect(result.alreadyComplete).toBe(false);
    expect(result.migrated).toBe(3);
    expect(result.failures).toEqual([]);

    expect(mockSecureStore.get('accessToken')).toBe('legacy-access-token-jwt');
    expect(mockSecureStore.get('refreshToken')).toBe('legacy-refresh-token-jwt');
    expect(mockSecureStore.get('user')).toBe(JSON.stringify({ id: 'u1', phone: '+639171234567' }));
  });

  it('deletes legacy plaintext copies after migration', async () => {
    mockLegacyStore.set('accessToken', 'legacy-jwt');
    mockLegacyStore.set('refreshToken', 'legacy-refresh');

    await migrateLegacyTokensIfNeeded();

    expect(mockLegacyStore.has('accessToken')).toBe(false);
    expect(mockLegacyStore.has('refreshToken')).toBe(false);
  });

  it('marks migration complete via flag in secure store', async () => {
    mockLegacyStore.set('accessToken', 'jwt');
    await migrateLegacyTokensIfNeeded();
    expect(mockSecureStore.get('auth-migration-v1-complete')).toBe('true');
  });

  it('is idempotent: subsequent calls are no-ops once flag is set', async () => {
    mockSecureStore.set('auth-migration-v1-complete', 'true');
    mockLegacyStore.set('accessToken', 'jwt-that-should-not-be-touched');

    const result = await migrateLegacyTokensIfNeeded();

    expect(result.alreadyComplete).toBe(true);
    expect(result.migrated).toBe(0);
    // Legacy token NOT migrated (already complete) — left in legacy store
    expect(mockLegacyStore.get('accessToken')).toBe('jwt-that-should-not-be-touched');
    expect(mockSecureStore.has('accessToken')).toBe(false);
  });

  it('marks migration complete even on a clean install (no legacy keys)', async () => {
    // Clean install: legacy store is empty.
    const result = await migrateLegacyTokensIfNeeded();

    expect(result.alreadyComplete).toBe(false);
    expect(result.migrated).toBe(0);
    expect(result.failures).toEqual([]);
    // Flag still set so future boots short-circuit.
    expect(mockSecureStore.get('auth-migration-v1-complete')).toBe('true');
  });

  it('does NOT migrate empty-string values (treated as no-op)', async () => {
    mockLegacyStore.set('accessToken', '');
    mockLegacyStore.set('refreshToken', 'real-refresh');

    const result = await migrateLegacyTokensIfNeeded();

    expect(result.migrated).toBe(1);
    expect(mockSecureStore.has('accessToken')).toBe(false);
    expect(mockSecureStore.get('refreshToken')).toBe('real-refresh');
  });

  it('captures legacy-read failures without aborting the migration', async () => {
    // Force the legacy store getString to throw for one specific key.
    const originalGet = mockLegacyStore.get.bind(mockLegacyStore);
    let getCallCount = 0;
    mockLegacyStore.get = ((k: string) => {
      getCallCount++;
      if (k === 'refreshToken' && getCallCount > 1) {
        throw new Error('simulated MMKV read failure');
      }
      return originalGet(k);
    }) as typeof mockLegacyStore.get;

    mockLegacyStore.set('accessToken', 'jwt-access');
    mockLegacyStore.set('refreshToken', 'jwt-refresh');
    mockLegacyStore.set('user', JSON.stringify({ id: 'u1' }));

    const result = await migrateLegacyTokensIfNeeded();

    // accessToken and user migrated; refreshToken failure recorded
    expect(result.migrated).toBeGreaterThanOrEqual(2);
    expect(result.failures.length).toBeGreaterThanOrEqual(1);
    expect(result.failures.some((f) => f.key === 'refreshToken')).toBe(true);
    // Migration still marked complete despite partial failure
    expect(mockSecureStore.get('auth-migration-v1-complete')).toBe('true');
  });
});
