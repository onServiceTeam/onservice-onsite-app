# Phase K Batch 6 — config + lib (8 files, ~771 lines)

## Files fully read
- apps/mobile/src/config/accessibility.ts (90)
- apps/mobile/src/config/animations.ts (70)
- apps/mobile/src/config/navigation.ts (174)
- apps/mobile/src/config/platform.config.ts (82)
- apps/mobile/src/config/theme.ts (85)
- apps/mobile/src/lib/i18n.ts (88)
- apps/mobile/src/lib/logger.ts (68)
- apps/mobile/src/lib/toast.ts (27)

## Findings

### MED-K20 — platformConfig.commissionRates missing 'founding' tier
**Where found:** apps/mobile/src/config/platform.config.ts:17-22
```ts
commissionRates: {
  new: 0.15,
  verified: 0.13,
  pro: 0.11,
  elite: 0.09,
} as Record<string, number>,
```
**Understood:** Migration 073 added `'founding'` to the provider tier enum, and migration 050 has `commission_rate_founding` in platform_settings. The mobile config is missing 'founding'. Lookups via `commissionRates['founding']` return undefined. earnings.tsx:148 specifically uses `commissionRates.elite` and `commissionRates.new` to compute the displayed commission range — a founding-tier provider sees "9-15%" instead of "9-15% (you're at 10%)".

This is also a 3-way drift:
- Mobile platform.config.ts: 4 tiers, hardcoded.
- platform_settings DB rows: 5 tiers (founding + 4), admin-editable.
- Provider tier enum (migration 073): 5 values.

**Fix:** Add `founding: 0.10` to the local fallback. Better: source `commissionRates` from `getConfig()` (the runtime config service) so admin edits flow through, not from the hardcoded constant.

### MED-K21 — Hardcoded business values diverge from platform_settings DB defaults
**Where found:** apps/mobile/src/config/platform.config.ts vs packages/api/migrations/038_platform_settings.sql
**Understood:**
| Setting | platform.config.ts (mobile) | platform_settings (DB) |
|---|---|---|
| serviceFeeRate | 0.10 (10%) | 0.05 (5%) |
| minimumWithdrawalAmount | 10000 (₱100) | 50000 (₱500) |
| commission_rate_new | 0.15 | 0.20 |
| commission_rate_verified | 0.13 | 0.18 |
| commission_rate_pro | 0.11 | 0.15 |
| commission_rate_elite | 0.09 | 0.12 |

The mobile is showing the user a different fee + commission than the server actually charges. The server-canonical pricing (Phase 14 D05) means money flows use the DB values, but the UI quotes/displays use the hardcoded values. **Customer/provider sees a different number than they pay/receive.**

config.service.ts:48-83 fetches some of these from `/api/v1/config` but the mapping is partial (commissionRates not fetched, minimumWithdrawalAmount not in the response shape). The cached defaults override silently.

**Fix:** Either (a) Sync the hardcoded constants in platform.config.ts to match migration 038/050 defaults (lossy: loses admin runtime overrides), OR (b) Expand `/api/v1/config` to return ALL admin-editable values + update config.service.ts merge logic. Option (b) is the design intent.

### MED-K22 — showRetryableToast doesn't render the retry action
**Where found:** apps/mobile/src/lib/toast.ts:18-27
```ts
export function showRetryableToast(
  message: string,
  _onRetry: () => void,  // ← prefixed with underscore = unused
  type: ToastType = 'error',
): void {
  useToastStore.getState().show(message, type);
}
```
**Understood:** Callers pass a retry callback, but the function ignores it (note the `_onRetry` underscore prefix). The Toast UI has no "Retry" button. Comment admits "v1.1+ will inline an action button". Today, the callback is dead — caller has no way to know its retry won't fire.
**Fix:** Either add an action button to Toast.tsx (extend the store's show signature with optional `action: { label, onPress }`), OR throw/log when `_onRetry` is non-null so callers get a signal. Today's silent no-op is a UX trap.

### CONFIRMATION-K06 — IDENTITY_VERIFICATION + BACKGROUND_CHECK_STATUS routes are declared but not wired
**Where found:** apps/mobile/src/config/navigation.ts:142-143
The Routes object exposes these route strings, but the provider-onboarding `_layout.tsx` doesn't include them as `<Stack.Screen>`. Calling `router.push(Routes.PROVIDER_ONBOARDING.IDENTITY_VERIFICATION)` would resolve the path string, but expo-router won't find a registered screen to render. Confirms CRIT-K06: dead code referenced from Routes constants.

### POSITIVE — accessibility.ts
- MIN_TOUCH_TARGET=44 (WCAG/iOS HIG/Material). highContrastColors palette meets WCAG AA.
- statusIndicators provides text+icon for colorblind safety.
- Wrappers for AccessibilityInfo.isReduceMotionEnabled / isScreenReaderEnabled / announceForAccessibility.

### POSITIVE — animations.ts
- Spring + timing presets named (gentle/snappy/bouncy + fast/normal/slow). Standard transition configs for screens.

### POSITIVE — navigation.ts
- Single source of truth for paths (Bug 1185 fix). buildRoute handles dynamic [params] with encodeURIComponent.
- Throws on missing params with helpful diagnostic. Strong contract.

### POSITIVE — theme.ts
- Bug 1324 fix verified — primary brand color #1B3A4B (deep teal) matches docs/design-system/tokens.json.
- Spacing scale (xs..xxl), typography roles, borderRadius scale all clean.

### POSITIVE — i18n.ts
- Returns key on miss (typos visible during dev). Locale switcher stub for v1.1+.
- 30+ keys defined for the v1.0 surface. {param} substitution works.

### POSITIVE — logger.ts
- Routes through Sentry breadcrumbs. Dev-only console fallback. Avoids no-console gate violation.
- Maps 'warn' → Sentry's 'warning' at the boundary.

## Cumulative Phase K progress: 116 / ~140 files (~13,798 lines)
