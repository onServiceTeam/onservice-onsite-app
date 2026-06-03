// apps/mobile/src/services/auth-migration.web.ts
//
// Phase 200 — WEB no-op. The native migration moves tokens out of legacy
// unencrypted MMKV into the encrypted store; there is no such legacy state in
// a fresh browser, so this is a no-op that matches the native API shape.

export interface MigrationResult {
  migrated: number;
  alreadyComplete: boolean;
  failures: Array<{ key: string; error: string }>;
}

export async function migrateLegacyTokensIfNeeded(): Promise<MigrationResult> {
  return { migrated: 0, alreadyComplete: true, failures: [] };
}

export function __resetMigrationFlagForTests(): void {
  // no-op on web
}
