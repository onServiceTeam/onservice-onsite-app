# Audit 2026-05-01 — Phase K COMPLETE — Mobile shared/layouts/onboarding/components

**Status:** All ~154 mobile files in Phase K scope read line-by-line. 100% of `apps/mobile/` source covered.

## Files fully read in Phase K (154 total, ~15,288 lines)

Per-batch breakdown documented in:
- PHASE-K-PARTIAL-FINDINGS.md (initial 77 files)
- PHASE-K-BATCH-01.md through PHASE-K-BATCH-08.md (subsequent 77 files in 3-5 file batches)

## NEW CRITICAL findings from Phase K (12)

| ID | One-line | File:line |
|---|---|---|
| **CRIT-K01** | Two secure-storage implementations; old one with hardcoded encryption key still in use | secure-storage.service.ts:4-6 |
| **CRIT-K02** | Provider tabs layout has no role check | (provider-tabs)/_layout.tsx:17-77 |
| **CRIT-K03** | push.service.ts reads user from legacy unencrypted storage; provider deep-links broken | push.service.ts:100-109 |
| **CRIT-K04** | socket.service.ts reads accessToken from legacy storage; sockets fail to authenticate | socket.service.ts:14 |
| **CRIT-K05** | Two storage locations for booking photos active in mobile (TEXT[] arrays vs booking_photos table) | booking.service.ts:33-35,231-241 |
| **CRIT-K06** | Provider onboarding has dead-code parallel KYC flow (identity-verification.tsx not in stack) | provider-onboarding/_layout.tsx + identity-verification.tsx |
| **CRIT-K07** | background-check-status.tsx is a static placeholder, never queries server | background-check-status.tsx:40-60 |
| **CRIT-K08** | Provider earnings chart shows hardcoded fake data (same value × 7 days) | (provider-tabs)/earnings.tsx:153-165 |
| **CRIT-K09** | CommissionBreakdown panel shows static 12% regardless of provider tier | (provider-tabs)/earnings.tsx:168-186 |
| **CRIT-K10** | Provider auto-routed to provider-tabs after submit, before admin approval | terms.tsx:42-48 |
| **CRIT-K11** | useWallet uses /api/v1/wallet/* (singular); payment.service uses /api/v1/wallets/* (plural) — one is dead | useWallet.ts:38-39 vs payment.service.ts:35 |
| **CRIT-K12** | useWallet expects snake_case fields; payment.service expects camelCase — one returns garbage | useWallet.ts:5-10 vs payment.service.ts:17-21 |

## NEW MEDIUM findings from Phase K (24)

| ID | One-line |
|---|---|
| MED-K01 | getDeviceFingerprint() race condition |
| MED-K02 | auth.store.verifyOtp lacks API response shape validation |
| MED-K03 | api.ts refreshOnce() not synchronized; concurrent 401s trigger N parallel refreshes |
| MED-K04 | Auth + onboarding screens use axios-shape error parsing on ApiError objects (server messages never display) |
| MED-K05 | provider-api.service.ts ProviderSelf.tier interface missing 'founding' tier |
| MED-K06 | Provider onboarding service-area defaults to Manila for unknown cities (Boracay launch-family pattern) |
| MED-K07 | Provider onboarding doesn't capture ID number, NBI expiry, ID expiry — photo-only |
| MED-K08 | identity-verification.tsx silent-404 fallback unreachable due to error-shape mismatch |
| MED-K09 | Customer doesn't see selected location in home header |
| MED-K10 | provider-profile yearsExperience/radius accept any positive integer (no client-side bounds) |
| MED-K11 | Provider dashboard renders job.servicePrice instead of job.totalAmount |
| MED-K12 | push.service.ts isRegistered tracked via legacy storage; re-registers every boot |
| MED-K13 | Auth screens default register-mode landing puts ALL users in provider-onboarding |
| MED-K14 | useImagePicker mime-type derived from extension; spoofable |
| MED-K15 | NewJobModal auto-decline uses ambiguous status transition (cancelled_by_provider) |
| MED-K16 | PhoneInput regex `^(09|9)\d{9}$` rejects +63 prefix that utils/phone validatePHPhone accepts |
| MED-K17 | StatusBadge missing several real booking statuses; raw enum displayed when unmapped |
| MED-K18 | Haptics not gated by accessibility reduceMotion preference (Button/Toast/lists) |
| MED-K19 | Toast display duration is fixed 3 seconds for all severities |
| MED-K20 | platformConfig.commissionRates missing 'founding' tier |
| MED-K21 | Hardcoded business values in platform.config.ts diverge from platform_settings DB defaults (serviceFeeRate, minimumWithdrawalAmount, all 4 commission rates) |
| MED-K22 | showRetryableToast accepts onRetry but doesn't render an action button |
| MED-K23 | useOffline polls every 30s instead of using NetInfo events |
| MED-K24 | App Store ENS declaration `ITSAppUsesNonExemptEncryption: false` likely incorrect (MMKV uses AES-256) |

## Cumulative running totals (after Phase K)

| | Total | Phase K additions |
|---|---:|---:|
| **CRITICAL** | **155 + 3 (J) + 12 (K) = 170 real** (1 invalidated of 171) | **+12** |
| **MEDIUM** | **422 + 16 (J) + 24 (K) = 462** | **+24** |
| Lines fully read | ~95,500 / 146,236 | +15,288 |
| Coverage | **65.3%** | +10.5% |

## Phase K → Phase L handoff

Mobile app (50,845 lines) is now 100% covered. Remaining unread:
- packages/api: ~50,000 lines unread (services + routes + middleware + validators + utils + jobs + config + server)
- apps/admin: ~1,800 lines unread (components + lib + stores + hooks + main)
- scripts + infra: ~3,300 lines unread

**Next: Phase L — Admin shared (non-page) source**

The admin app is 23,976 lines total. Phase F covered the 58 pages (~21,111 lines). Phase L closes the gap:
- apps/admin/src/components/ (25 files, 1,159 lines)
- apps/admin/src/lib/ (4 files, 378 lines)
- apps/admin/src/stores/ (1 file, 66 lines)
- apps/admin/src/App.tsx (87)
- apps/admin/src/main.tsx (49)
- apps/admin/src/hooks/ (1 file, 41 lines)
- apps/admin/src/config/ (1 file, 10 lines)
- apps/admin/src/vite-env.d.ts (15)
- apps/admin/vitest.setup.ts (122)
- apps/admin/playwright.config.ts (16)
- apps/admin/vite.config.ts (22)
- apps/admin/vitest.config.ts (32)
- apps/admin/tsconfig.json (18)
- apps/admin/package.json (55)
- apps/admin/vercel.json (17)

Total Phase L: ~2,100 lines / ~36 files. Should land cleanly in 6-8 batches of 4-6 files each.

Continuing now into Phase L.
