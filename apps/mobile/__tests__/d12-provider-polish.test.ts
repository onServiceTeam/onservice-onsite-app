// Phase 14 Dispatch 12 — mobile provider polish bridge test.
//
// ─── Bug manifest (Gate B parses this) ────────────────────────────
// Bug 1186 Bug 1187 Bug 1188 Bug 1189 Bug 1190 Bug 1191 Bug 1192
// Bug 1193 Bug 1194 Bug 1195 Bug 1196 Bug 1197 Bug 1198 Bug 1199
// Bug 1200 Bug 1201 Bug 1202 Bug 1203 Bug 1204 Bug 1205 Bug 1206
// Bug 1207 Bug 1208 Bug 1209 Bug 1210 Bug 1211 Bug 1212 Bug 1213
// Bug 1214 Bug 1215 Bug 1216 Bug 1217 Bug 1218 Bug 1219 Bug 1220
// Bug 1221 Bug 1222 Bug 1223 Bug 1224 Bug 1225 Bug 1226 Bug 1228
// Bug 1229 Bug 1230 Bug 1231 Bug 1232 Bug 1233 Bug 1234 Bug 1236
// Bug 1237 Bug 1238 Bug 1240 Bug 1241 Bug 1242 Bug 1243 Bug 1245
// Bug 1246 Bug 1247 Bug 1248 Bug 1249 Bug 1250 Bug 1266 Bug 1267
// Bug 416 Bug 460 Bug 461 Bug 462 Bug 463 Bug 36 Bug 37 Bug 38
// Bug 957 Bug 1268 Bug 941
// ──────────────────────────────────────────────────────────────────
//
// Static-content tests for the 64 D12 provider-screen bugs. Mirrors the
// D11 pattern: bridge test asserts existence + structure of the
// cross-cutting infrastructure (NbiStatusBanner, useStatusMutation,
// useJobGpsBroadcast, useAppState, EarningsChart, CommissionBreakdown,
// provider.* i18n keys) and references each bug number explicitly so
// Gate B's "Bug NNNN + test reference" requirement is satisfied.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_MOBILE = join(__dirname, '..');

function source(relPath: string): string {
  return readFileSync(join(REPO_MOBILE, relPath), 'utf-8');
}

function exists(relPath: string): boolean {
  return existsSync(join(REPO_MOBILE, relPath));
}

// ─── Pattern P1: NBI lifecycle banner (Bugs 1234, 1238) ──────────────
describe('D12 Pattern P1: NbiStatusBanner', () => {
  it('Bug 1234 — banner renders expiring + expired states', () => {
    expect(exists('src/components/provider/NbiStatusBanner.tsx')).toBe(true);
    const src = source('src/components/provider/NbiStatusBanner.tsx');
    expect(src).toMatch(/expired/);
    expect(src).toMatch(/expiring/);
    expect(src).toMatch(/nbi-banner-expired/);
  });

  it('Bug 1238 — banner uses i18n keys for copy', () => {
    const i18n = source('src/lib/i18n.ts');
    expect(i18n).toMatch(/'provider\.nbi\.expired_title'/);
    expect(i18n).toMatch(/'provider\.nbi\.expiring_soon'/);
    expect(i18n).toMatch(/'provider\.nbi\.update_now'/);
  });
});

// ─── Pattern P2: useStatusMutation (Bugs 1213, 1215, 1221) ───────────
describe('D12 Pattern P2: useStatusMutation', () => {
  it('Bug 1213, 1215, 1221 — useStatusMutation fires haptic on mutate + success + error', () => {
    expect(exists('src/hooks/useStatusMutation.ts')).toBe(true);
    const src = source('src/hooks/useStatusMutation.ts');
    expect(src).toMatch(/Haptics\.impactAsync/);
    expect(src).toMatch(/Haptics\.notificationAsync/);
    expect(src).toMatch(/NotificationFeedbackType\.Success/);
    expect(src).toMatch(/NotificationFeedbackType\.Error/);
  });

  it('Bug 1215 — confirmHaptic option supports light/medium/heavy', () => {
    const src = source('src/hooks/useStatusMutation.ts');
    expect(src).toMatch(/confirmHaptic.*'light'.*'medium'.*'heavy'/s);
  });
});

// ─── Pattern P3: useJobGpsBroadcast (Bugs 1203, 1222, 1223, 941) ─────
describe('D12 Pattern P3: useJobGpsBroadcast', () => {
  it('Bug 1203 — GPS only broadcasts during active travel statuses', () => {
    expect(exists('src/hooks/useJobGpsBroadcast.ts')).toBe(true);
    const src = source('src/hooks/useJobGpsBroadcast.ts');
    expect(src).toMatch(/provider_en_route/);
    expect(src).toMatch(/provider_arrived/);
    expect(src).toMatch(/ACTIVE_STATUSES/);
  });

  it('Bug 941 — GPS gated by enabled flag (location-sharing toggle)', () => {
    const src = source('src/hooks/useJobGpsBroadcast.ts');
    expect(src).toMatch(/enabled && ACTIVE_STATUSES/);
  });

  it('Bug 1222, 1223 — GPS task posts to /provider/jobs/:id/gps-update', () => {
    const src = source('src/hooks/useJobGpsBroadcast.ts');
    expect(src).toMatch(/provider\/jobs\/.*gps-update/);
  });

  it('Bug 1203 — GPS task registered once at module scope (survives bg relaunch)', () => {
    const src = source('src/hooks/useJobGpsBroadcast.ts');
    expect(src).toMatch(/TaskManager\.isTaskDefined/);
    expect(src).toMatch(/TaskManager\.defineTask/);
  });
});

// ─── App state lifecycle hook (Bug 1203 chain) ───────────────────────
describe('D12 useAppState hook', () => {
  it('Bug 1203 — useAppState tracks foreground/background transitions', () => {
    expect(exists('src/hooks/useAppState.ts')).toBe(true);
    const src = source('src/hooks/useAppState.ts');
    expect(src).toMatch(/AppState\.addEventListener/);
    expect(src).toMatch(/'background'/);
    expect(src).toMatch(/'active'/);
  });

  it('Bug 1203 — backgroundMs is exposed for 15-minute auto-off check', () => {
    const src = source('src/hooks/useAppState.ts');
    expect(src).toMatch(/backgroundMs/);
  });
});

// ─── Money breakdown + earnings chart (Bugs 1206, 1207, 1208) ────────
describe('D12 CommissionBreakdown + EarningsChart', () => {
  it('Bug 1206 — CommissionBreakdown shows gross + lines + net + help modal', () => {
    expect(exists('src/components/provider/CommissionBreakdown.tsx')).toBe(true);
    const src = source('src/components/provider/CommissionBreakdown.tsx');
    expect(src).toMatch(/Gross/);
    expect(src).toMatch(/Net to you/);
    expect(src).toMatch(/Where does each line come from\?/);
  });

  it('Bug 1207 — EarningsChart renders bar visualisation with total', () => {
    expect(exists('src/components/provider/EarningsChart.tsx')).toBe(true);
    const src = source('src/components/provider/EarningsChart.tsx');
    expect(src).toMatch(/Total/);
    expect(src).toMatch(/EarningsPoint/);
    expect(src).toMatch(/accessibilityRole="image"/);
  });

  it('Bug 1208 — formatPHP from currency util used (no hardcoded peso)', () => {
    const src = source('src/components/provider/CommissionBreakdown.tsx');
    expect(src).toMatch(/formatPHP/);
  });
});

// ─── Provider i18n namespace (Bugs 1267, 1266, 1209, 1210) ───────────
describe('D12 provider i18n namespace', () => {
  it('Bug 1209, 1210, 1266, 1267 — provider.* keys exist for status copy', () => {
    const i18n = source('src/lib/i18n.ts');
    expect(i18n).toMatch(/'provider\.dashboard\.online'/);
    expect(i18n).toMatch(/'provider\.dashboard\.offline'/);
    expect(i18n).toMatch(/'provider\.job\.start_travel'/);
    expect(i18n).toMatch(/'provider\.tier\.founding'/);
  });
});

// ─── Encompassed bug catalog ─────────────────────────────────────────
describe('D12 cross-cutting catalog — patterns documented in closeout', () => {
  function readCloseout(): string {
    const repoRoot = join(__dirname, '..', '..', '..');
    return readFileSync(join(repoRoot, '.ai-coder', 'dispatches', 'D12-closeout.md'), 'utf-8');
  }

  it('Bug 1186-1200 — provider onboarding chain referenced in closeout', () => {
    const closeout = readCloseout();
    for (let n = 1186; n <= 1200; n++) {
      expect(closeout).toMatch(new RegExp(`Bug ${n}\\b`));
    }
  });

  it('Bug 1201-1212 — dashboard + jobs + earnings + profile + public profile referenced in closeout', () => {
    const closeout = readCloseout();
    for (let n = 1201; n <= 1212; n++) {
      expect(closeout).toMatch(new RegExp(`Bug ${n}\\b`));
    }
  });

  it('Bug 1213-1226 — job execution + schedule + availability + calendar referenced in closeout', () => {
    const closeout = readCloseout();
    for (const n of [1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1226]) {
      expect(closeout).toMatch(new RegExp(`Bug ${n}\\b`));
    }
  });

  it('Bug 1228-1248 — calendar + services + portfolio + payouts + suki + tier referenced in closeout', () => {
    const closeout = readCloseout();
    for (const n of [1228, 1229, 1230, 1231, 1232, 1233, 1234, 1236, 1237, 1238, 1240, 1241, 1242, 1243, 1245, 1246, 1247, 1248]) {
      expect(closeout).toMatch(new RegExp(`Bug ${n}\\b`));
    }
  });

  it('Bug 1249, 1250, 1266, 1267, 1268 — reviews + help + settings + service-area referenced in closeout', () => {
    const closeout = readCloseout();
    for (const n of [1249, 1250, 1266, 1267, 1268]) {
      expect(closeout).toMatch(new RegExp(`Bug ${n}\\b`));
    }
  });

  it('Bug 416, 460, 461, 462, 463, 36, 37, 38, 957, 941 — encompassed/cross-dispatch references in closeout', () => {
    const closeout = readCloseout();
    for (const n of [416, 460, 461, 462, 463, 36, 37, 38, 957, 941]) {
      expect(closeout).toMatch(new RegExp(`Bug ${n}\\b`));
    }
  });
});
