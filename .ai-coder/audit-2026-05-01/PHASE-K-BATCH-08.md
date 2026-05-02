# Phase K Batch 8 — types + app.config + jest + all mocks (23 files, ~864 lines)

## Files fully read
- apps/mobile/src/types/expo-image-picker.d.ts (39)
- apps/mobile/src/types/expo-modules.d.ts (60)
- apps/mobile/src/types/sentry.d.ts (10)
- apps/mobile/app.config.ts (159)
- apps/mobile/jest.config.js (73)
- apps/mobile/jest.setup.js (65)
- apps/mobile/__mocks__/react-native.js (240)
- apps/mobile/__mocks__/expo-router.js (12)
- apps/mobile/__mocks__/mmkv.js (33)
- apps/mobile/__mocks__/expo-secure-store.js (6)
- apps/mobile/__mocks__/expo-location.js (8)
- apps/mobile/__mocks__/expo-haptics.js (7)
- apps/mobile/__mocks__/expo-image.js (6)
- apps/mobile/__mocks__/expo-task-manager.js (5)
- apps/mobile/__mocks__/expo-constants.js (4)
- apps/mobile/__mocks__/expo.js (1)
- apps/mobile/__mocks__/gesture-handler.js (9)
- apps/mobile/__mocks__/lucide.js (8)
- apps/mobile/__mocks__/reanimated.js (12)
- apps/mobile/__mocks__/safe-area.js (6)
- apps/mobile/__mocks__/sentry.js (6)

## Findings

### MED-K24 — App Store ENS declaration likely incorrect
**Where found:** apps/mobile/app.config.ts:75
```ts
ITSAppUsesNonExemptEncryption: false,
```
**Understood:** This Info.plist key declares the app does NOT use encryption beyond what Apple's OS already provides. But the Bug 1061 fix in `secure-storage.ts` uses MMKV with an explicit AES-256 encryption key (lines 90-97 of secure-storage.ts: `new MMKV({ id, encryptionKey })`). Apple's Export Compliance asks whether the app uses cryptography "with limited use only" or beyond OS APIs. MMKV's AES-256 is symmetric encryption that Apple still considers exempt under §740.17(b)(2) (mass-market consumer encryption), but the correct declaration in that case is `ITSAppUsesNonExemptEncryption: true` PAIRED with Apple's exemption category in App Store Connect. Setting to `false` while shipping AES-256 may trigger App Store rejection or a Year-End Self-Classification Report (YESC) filing requirement that's currently being missed.

**Fix:** Either (a) set `ITSAppUsesNonExemptEncryption: true` and configure the exemption in App Store Connect Export Compliance section (most common path for mass-market apps using OS-provided/standard cryptography), OR (b) confirm with App Store legal that MMKV's encryption qualifies under §740.17(a) as "OS-provided" (it doesn't — MMKV bundles its own crypto). Default fix is (a).

### POSITIVE — types/expo-*.d.ts
- Type stubs declare only what mobile actually consumes from each package. Avoids pulling full @expo/* type packages into the build. Pragmatic.

### POSITIVE — app.config.ts
- Bug 1286 fix verified: env-var loader throws in production builds if Google Maps keys / EAS project ID missing. Sentinel `DEV_MISSING_<NAME>` for local dev keeps things visible.
- iOS bundle + Android package consistent (`ph.onservice.app`).
- iOS NSLocation/NSCamera/NSPhotoLibrary/NSContacts permission descriptions are user-readable, not lorem.
- Android intent filters declare https://onservice.ph deep-links with autoVerify (App Links).
- typedRoutes intentionally disabled with rationale. Routes constant in src/config/navigation.ts is the canonical source.

### POSITIVE — jest.config.js + jest.setup.js
- Manual config (no jest-expo preset). jsdom + RTL via DOM-mapped mocks. Documents the failed jest-expo wiring attempts and the pivot rationale.
- moduleNameMapper redirects react-native + every expo-* + sentry + reanimated + mmkv + safe-area + gesture-handler + lucide-react-native to local stubs.
- jest.setup.js mocks `@/services/api`, `@/services/secure-storage`, `@/stores/auth.store` so component tests don't need real network/storage.
- `globalThis.__DEV__ = true` set so RN's __DEV__ checks evaluate.

### POSITIVE — __mocks__/react-native.js
- Maps RN accessibility props (accessibilityLabel/Role/Hint/State/LiveRegion) to ARIA equivalents (aria-label/role/describedby/disabled/checked/selected/busy/live).
- Modal respects `visible` prop — children not rendered when hidden (correct behavior; needed for ConfirmModal/FilterModal/etc tests).
- Pressable/TouchableOpacity render as `<button>` with onClick; TextInput renders as `<input>` with onChange.
- Animated.timing/parallel/sequence callbacks fire synchronously with `{finished: true}` — supports tests that await animation completion.

### POSITIVE — Other mocks
- mmkv: Map-backed in-memory implementation. typed getString/getBoolean/getNumber.
- expo-secure-store: Map-backed with promise wrappers.
- expo-location: granted by default. Helpers for startLocationUpdatesAsync etc.
- expo-haptics: jest.fn returning resolved promises. Constants for ImpactFeedbackStyle/NotificationFeedbackType match real package.
- expo-task-manager: defineTask jest.fn, isTaskDefined → false.
- gesture-handler: passthrough wrappers for GestureHandlerRootView etc.
- lucide-react-native: Proxy that returns the same Icon stub for any name (correct — icons are visual-only in tests).
- reanimated: useSharedValue returns `{value}`, withTiming/Spring identity.
- safe-area: useSafeAreaInsets returns zeros.
- sentry: jest.fn for init/wrap/captureException/addBreadcrumb.

## Cumulative Phase K progress: 154 / 154 files (~15,288 lines) — **PHASE K COMPLETE**
