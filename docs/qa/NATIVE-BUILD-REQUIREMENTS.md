# Native Android build — status + what it needs (Appium + Maestro baselines)

The app ships as a **web build** (Expo web export), fully tested at the web/API
layer. This file tracks the **native** Android/iOS build, which gates two
device-level QA tracks: Appium native E2E and the F#3 Maestro visual baselines.

## STATUS (reconciled 2026-08-25): native alignment is not on master; web remains green; device capture is still pending

The dependency migration described below was completed and a debug APK was
proven in June, but the referenced `native-build-sdk55-align` branch no longer
exists locally or on the current GitHub remote and its dependency changes were
not merged into master. Current master still uses Reanimated 3.17 and the older
SDK-55 module versions. `npx expo install --check` reproduces that drift.

The historical migration evidence showed that, with the aligned dependency set:

- **Every native module compiles** (reanimated 4, screens, all expo modules).
- A **debug APK builds (217 MB), installs, and launches** on an Android emulator.
  The native build genuinely works with the aligned dependency set.
- **JS/web stay green** on that branch: `apps/mobile` jest 766 pass; `expo export
  -p web` builds a correct bundle (app.onservice.ph, no dev placeholders). So the
  alignment is safe for the deployed web path.

Two host limitations also affected the June run from the old deep OneDrive
checkout:

1. **Windows 260-char path limit** on the C++/CMake codegen (e.g.
   `react-native-mmkv:buildCMakeRelWithDebInfo`). A `C:\o` directory junction
   helps the debug variant, but CMake canonicalizes the junction back to the long
   `C:\Users\...\OneDrive\...` path, so the release variant still overflows.
   `LongPathsEnabled` requires admin rights (not available here).
2. **Metro dev-server resolution flakiness** under OneDrive: files that exist
   (`pretty-format/build/index.js`, `react-refresh/cjs/...`) fail to resolve in
   the dev bundle — the classic symptom of OneDrive cloud-placeholder files
   defeating Metro's file watcher. (Release bundling avoids this but hits #1.)

**Fastest path to finish on-device testing (operator choice):**
- **EAS Build** (Expo's cloud build, Linux — no path or OneDrive issues): build
  the APK in the cloud, then run Maestro/Appium against it locally. Recommended.
- **Move the repo off OneDrive** to a short real path (e.g. `C:\dev\onservice`,
  a real `git clone`, not a junction) and enable Windows long paths. Then the
  local debug/release builds + Maestro/Appium run as scripted below.

Maestro and Appium are scaffolded: 89 screen flows plus two setup helpers and
`scripts/maestro/capture-baselines.sh` are committed; Appium 2 + uiautomator2
are installed and `qa-frameworks/appium/smoke.mjs` is written. They need a
fresh aligned APK and a supported device/emulator session.

**Recreating and landing the dependency alignment:** use a fresh topic branch.
It changes the deployed web app's dependencies (Reanimated 4, Sentry 7, and the
Expo/native modules), so rebuild the migration from current master, prove the
APK, Jest suite, and web export, deploy that exact artifact to staging, and run
the live browser gates before merging.

---

## Appendix — the migration (already done on the branch)

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
`react-native-webview` 13.13→13.16, `react-native` 0.83.0→0.83.10, plus several
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
  `bash scripts/maestro/capture-baselines.sh`. The 89 screen flows are already rewritten
  with real login + deep-link navigation (`scripts/maestro/generate-visual-flows.mjs`).
- **Appium native E2E:** Appium 2 + the uiautomator2 driver are installed; the
  smoke (`qa-frameworks/appium/smoke.mjs`) points at the debug APK and drives the
  real phone-app login.

## Recommendation

Treat this as its own focused task, not a side-effect of other work. The web +
API test coverage is already strong, so native device coverage is additive —
worth doing, but not worth risking the deployed web build by rushing the
reanimated 4 migration without the full verification in step 7.
