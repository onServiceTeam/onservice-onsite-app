# Phase K Batch 2 — shared cross-cutting components (5 files, ~607 lines)

## Files fully read
- apps/mobile/src/components/Avatar.tsx (77)
- apps/mobile/src/components/ConfirmModal.tsx (136)
- apps/mobile/src/components/FilterChips.tsx (89)
- apps/mobile/src/components/FilterModal.tsx (198)
- apps/mobile/src/components/PhoneInput.tsx (107)

## Findings

### MED-K16 — Two phone validation paths can drift
**Where found:**
- apps/mobile/src/components/PhoneInput.tsx:16 — `PH_MOBILE_REGEX = /^(09|9)\d{9}$/`
- apps/mobile/src/utils/phone.ts (NOT YET READ) exports `validatePHPhone` used by login.tsx:26 / register.tsx:27.

**Understood:** PhoneInput component runs its own `isValid` check via `PH_MOBILE_REGEX` for inline error display. The login/register screens additionally call `validatePHPhone()` from utils/phone.ts before submit. Two validators that can drift if one is updated and not the other.

**Fix:** PhoneInput should import `validatePHPhone` from `utils/phone.ts` instead of defining its own. Or — have PhoneInput export the regex as a single source of truth for validators.

### POSITIVE — Avatar.tsx
- Initials fallback on Image onError. Two-letter initials from first+last; single name → first 2 chars.
- accessibilityLabel includes name when provided.

### POSITIVE — ConfirmModal.tsx
- Android `hardwareBackPress` handler (Pattern 13) — back button cancels modal cleanly, blocked while loading.
- accessibilityRole="alert" + accessibilityState busy/disabled. Solid a11y.
- destructive variant uses error color.

### POSITIVE — FilterChips.tsx
- tablist/tab roles. Single-select. Trailing spacer for last-chip visibility.

### POSITIVE — FilterModal.tsx
- Hardware back dismissal (Pattern 13). Multi-select support. Local pending state until Apply. Reset clears all.
- accessibilityRole="checkbox" with checked state per option.

## Cumulative Phase K progress: 87 / ~140 files (~11,231 lines)
