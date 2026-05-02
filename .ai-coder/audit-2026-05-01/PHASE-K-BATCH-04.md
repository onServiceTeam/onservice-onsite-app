# Phase K Batch 4 — UI primitives (Button/Input/OTP/Badge/Toast) (5 files, ~534 lines)

## Files fully read
- apps/mobile/src/components/ui/Button.tsx (113)
- apps/mobile/src/components/ui/Input.tsx (93)
- apps/mobile/src/components/ui/OTPInput.tsx (105)
- apps/mobile/src/components/ui/Badge.tsx (45)
- apps/mobile/src/components/ui/Toast.tsx (178)

## Findings

### MED-K18 — Haptics not gated by accessibility reduceMotion preference
**Where found:**
- apps/mobile/src/components/ui/Button.tsx:43-46 — `hapticLight()` fires on every press, no preference check.
- apps/mobile/src/components/ui/Toast.tsx:45-59 — `hapticSuccess/Error/Warning` fires on every toast, no preference check.

**Understood:** `useAccessibilityStore` exposes `reduceMotionEnabled`. Haptics are a vestibular input that some users with motion sensitivity prefer to disable. Apple HIG and Android accessibility guidance both treat haptics as motion-class. The Button + Toast components fire haptics unconditionally.

**Fix:** Both components should `import { useAccessibilityStore }` and skip haptic calls when `reduceMotionEnabled === true`. Or add a `hapticIfEnabled()` helper in `utils/haptics.ts` that does the check.

### MED-K19 — Toast display duration is fixed 3 seconds for all severities
**Where found:** apps/mobile/src/components/ui/Toast.tsx:37 — `const DISPLAY_DURATION = 3000;`
**Understood:** Error and critical messages share the same 3-second display window as info/success. A user reading slowly or being interrupted (incoming call) misses critical errors that won't repeat. Apple HIG suggests 5-7s for errors.
**Fix:** Either (a) per-type duration: success/info=3s, warning=5s, error=7s; or (b) require user dismissal for type='error'.

### POSITIVE — Button.tsx
- accessibilityRole="button", accessibilityState busy + disabled.
- maxFontSizeMultiplier={2} (text scaling cap, prevents layout breakage at 300% zoom).
- MIN_TOUCH_TARGET enforced via size_sm/md/lg styles.
- Loading state replaces text with ActivityIndicator; disabled state opacity 0.5.

### POSITIVE — Input.tsx
- accessibilityLabelledBy via nativeID (associates label with input for screen readers).
- accessibilityRole="alert" + accessibilityLiveRegion="polite" on error (screen reader announces).
- focused border + error border are distinct visual states.

### POSITIVE — OTPInput.tsx
- textContentType="oneTimeCode" — iOS auto-fill from SMS code keyboard suggestion.
- Hidden TextInput overlay + visible cells (correct RN pattern).
- autoFocus on mount.
- Filtering `text.replace(/\D/g, '')` — strict digit-only.
- accessibilityElementsHidden on visual cells (avoids double-reading from screen reader).

### POSITIVE — Badge.tsx
- Simple, accessibilityRole="text".

### POSITIVE — Toast.tsx
- Zustand singleton store. Auto-hide after 3s.
- accessibilityRole="alert" + accessibilityLiveRegion="assertive" (screen reader interrupts).
- maxFontSizeMultiplier={1.5} (slightly tighter cap than Button's 2.0 — appropriate for floating overlay).
- elevation 8 + shadow on Android/iOS.

## Cumulative Phase K progress: 96 / ~140 files (~12,192 lines)
