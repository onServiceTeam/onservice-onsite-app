# Native Android build — what it needs (blocks Appium + Maestro baselines)

The app ships today as a **web build** (Expo web export) and is fully tested at
the web/API layer. The **native** Android/iOS build does not currently compile,
which blocks two device-level QA tracks: Appium native E2E and the F#3 Maestro
visual baselines. This file records exactly what the native build needs so the
migration can be done as one scoped, verified effort.

## Why it's blocked

`npx expo install --check` reports the installed native modules are behind the
versions Expo SDK 55 (React Native 0.83, new architecture) expects. The build
fails to compile against RN 0.83's new-architecture APIs.

Two concrete failures seen, in order:

1. **`react-native-mmkv` v4 needs `react-native-nitro-modules`** (peer dep, was
   missing). *Solved* by `npm install --legacy-peer-deps react-native-nitro-modules`.
2. **`react-native-reanimated` 3.17 is incompatible with RN 0.83.** Its native
   Android code calls `removeUIManagerListener(...)`, an old-architecture API
   removed in 0.83. Expo SDK 55 expects **reanimated 4.2.1**. This is a breaking
   major-version migration.

Other modules also flagged behind by `expo install --check` (align them too):
`react-native-gesture-handler` 2.24→2.30, `react-native-screens` 4.10→4.23,
`react-native-safe-area-context` 5.4→5.6, `react-native-svg` 15.8→15.15,
`react-native-webview` 13.13→13.16, `react-native` 0.83.0→0.83.6, plus several
`expo-*` patch bumps.

> Do NOT run a blanket `expo install --fix`: it also tries to DOWNGRADE jest
> (30→29.7) and typescript (6→5.9), which the project intentionally runs newer
> (the jest harness + tsconfig depend on them). Bump only the native modules.

## The migration (scoped; ~half a day with verification)

Do this on a **topic branch** — it touches the babel pipeline, so it affects
the web build and the jest suite, not just native.

1. `cd apps/mobile`
2. Keep `react-native-nitro-modules` (mmkv v4 peer dep).
3. `npx expo install react-native-reanimated react-native-gesture-handler \
      react-native-screens react-native-safe-area-context react-native-svg \
      react-native-webview` (pulls SDK-55 versions).
4. **Reanimated 4 babel change:** `babel.config.js` plugin moves from
   `react-native-reanimated/plugin` to `react-native-worklets/plugin`; install
   `react-native-worklets` if not pulled transitively.
5. Update the jest mock `apps/mobile/__mocks__/reanimated.js` to cover the v4
   API surface the app uses (any new/renamed exports).
6. `npx expo prebuild -p android --clean` then
   `cd android && ./gradlew :app:assembleDebug`.
7. **Verify nothing regressed** (the gate):
   - `npx jest` in `apps/mobile` stays green (766 tests).
   - `npx expo export -p web` still produces a working bundle (this is what's
     deployed to app.onservice.ph).
   - The app runs in the emulator and on web without animation regressions.
8. Only merge if all of step 7 is green.

## What unblocks when it lands

- **Maestro visual baselines (F#3):** install the debug APK on a booted
  emulator, start Metro with `EXPO_PUBLIC_API_URL=http://10.0.2.2:7381`, then
  `bash scripts/maestro/capture-baselines.sh`. The 84 flows are already rewritten
  with real login + deep-link navigation (`scripts/maestro/generate-visual-flows.mjs`).
- **Appium native E2E:** Appium 2 + the uiautomator2 driver are installed; the
  smoke (`qa-frameworks/appium/smoke.mjs`) points at the debug APK and drives the
  real phone-app login.

## Recommendation

Treat this as its own focused task, not a side-effect of other work. The web +
API test coverage is already strong, so native device coverage is additive —
worth doing, but not worth risking the deployed web build by rushing the
reanimated 4 migration without the full verification in step 7.
