// apps/mobile/src/services/auth-migration.ts
//
// One-time migration of legacy auth tokens from the unencrypted MMKV
// (id: `onservice-auth`, used by api.ts before Bug 1061 fix) to the
// encrypted MMKV (id: `onservice-auth-secure`, secure-storage.ts).
//
// Bug 1061 (Phase 14 Dispatch 01) fix component.
//
// Why migrate instead of forcing re-login: existing customers have
// active sessions. Forcing them to re-login on the next app open would
// be a poor UX trade-off when we can transparently move their tokens
// from the (compromised) unencrypted store to the (now-encrypted)
// secure store on the same device.
//
// The migration is idempotent: a flag in the new secure store records
// completion. Subsequent calls are no-ops.
//
// Boot sequence (apps/mobile/app/_layout.tsx):
//   await initSecureStorage();
//   await migrateLegacyTokensIfNeeded();
//   // ... rest of boot

import { storage } from './api';
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from './secure-storage';

const MIGRATION_FLAG_KEY = 'auth-migration-v1-complete';
const LEGACY_KEYS = ['accessToken', 'refreshToken', 'user'] as const;

export interface MigrationResult {
  migrated: number;
  alreadyComplete: boolean;
  failures: Array<{ key: string; error: string }>;
}

export async function migrateLegacyTokensIfNeeded(): Promise<MigrationResult> {
  // Idempotency check: if migration already ran, no-op.
  if (getSecureItem(MIGRATION_FLAG_KEY) === 'true') {
    return { migrated: 0, alreadyComplete: true, failures: [] };
  }

  let migratedCount = 0;
  const failures: Array<{ key: string; error: string }> = [];

  for (const key of LEGACY_KEYS) {
    try {
      const legacyValue = storage.getString(key);
      if (typeof legacyValue === 'string' && legacyValue.length > 0) {
        setSecureItem(key, legacyValue);
        // Best-effort delete of the legacy plaintext copy. If it fails
        // (e.g., MMKV file is read-only in some test scenarios), we
        // still mark migration complete because the new store is
        // authoritative going forward.
        try {
          storage.delete(key);
        } catch {
          // ignore — non-fatal
        }
        migratedCount++;
      }
    } catch (err) {
      failures.push({
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Mark migration complete. Even if no keys were migrated (clean
  // install or already-cleared session), set the flag so future boots
  // skip this work.
  setSecureItem(MIGRATION_FLAG_KEY, 'true');

  return { migrated: migratedCount, alreadyComplete: false, failures };
}

/**
 * Test-only helper to reset the migration flag so tests can re-run
 * the migration in a clean state. Production code MUST NOT call this.
 */
export function __resetMigrationFlagForTests(): void {
  try {
    removeSecureItem(MIGRATION_FLAG_KEY);
  } catch {
    // ignore
  }
}
