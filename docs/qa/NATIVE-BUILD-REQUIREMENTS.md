# Native Android build — status + what it needs (Appium + Maestro baselines)

The app has deployed **web builds** (Expo web export) and separately verified
source candidates. Neither source CI nor a web export proves complete live
business acceptance. This file tracks the **native** Android/iOS build, which
gates two device-level QA tracks: Appium native E2E and F#3 Maestro baselines.

## October 10: read-only APK artifact inspection

`scripts/release/inspect-android-apk.mjs` inspects a completed, immutable local
APK before it can be considered for the update-download lane. It does not build,
sign, install, upload or publish anything, and needs no signing secret. It runs
the selected installed SDK's actual `apksigner` and `aapt`, with a thirty-second
limit and eight-MiB output limit per tool. APK input is limited to512MiB. Keep
the build stopped during inspection; before/after hash and metadata checks are
not an adversarial concurrent-writer snapshot guarantee.

Supply four absolute paths to Node: APK, Android build-tools directory, Java
executable and an independently prepared expectation JSON file. For example,
from the repository root in PowerShell, using operator-selected path variables:

```powershell
node scripts/release/inspect-android-apk.mjs $apkPath $buildToolsDirectory $javaExecutable $expectationPath
```

The expectation has exactly these fields: `packageName`, `versionName`, numeric
`versionCode`, numeric `previousVersionCode`, `certificateSha256` (64 hex digits)
and `requiredAbis` (a nonempty unique array including `arm64-v8a`). Obtain the
certificate pin from the independently retained release identity, not the APK
being inspected. Obtain the prior code from the actual previous release record.
The tool verifies a strict increase over the supplied previous code; it does
not independently discover what was published or installed. The CLI returns a
fixed failure diagnostic and nonzero exit status without echoing tool errors or
manifest values. Successful JSON is evidence to retain, not an update manifest.

Checks include exact package/version identity, one pinned non-debug signer,
successful v2/v3 verification with warnings treated as errors, no debuggable or
test-only flag, known manifest development sentinels, one launchable activity,
numeric SDK levels, consistent archive/ABI inventory and nonempty manifest,
DEX and embedded JavaScript bundle entries. Actual permissions are reported for
review, not approved. SHA256, byte size, certificate and observed metadata are
returned with **`deploymentEligible:false` unconditionally**. No option changes
that result into release approval.

These checks deliberately do not claim that bundle/DEX/library presence proves
valid executable code, a particular source revision, correct Maps/API/CAPTCHA
configuration, safe permissions, full signature-lineage compatibility or device
behavior. Unknown SDK output fails closed. The complete-app storage/authentication,
physical-phone installation, two-version data-preserving upgrade, paired API/client
release, backup/rollback and served HTTPS/update acceptance remain mandatory.
This is not the requested in-app update button, automatic check or a usable APK.

Eleven Node contract tests execute through the existing mobile CI test harness.
They exercise policy parsing and actual failed subprocess/CLI behavior; synthetic
SDK observations are not cryptographic or device evidence. The local focused
selection passed three suites/22tests, no skips/TODOs, in5.21seconds. The final
full mobile run passed619suites/931tests with84existing TODOs, zero skips/failures,
in250.014seconds. Types, scoped lint, unchanged GateA10/C7 and seven smoke scripts
passed. The first lint attempt rejected a test-only missing `URL` import; that
import was corrected without a waiver before the full run. No new local full
API/admin, compiled browser or handset result is claimed. Exact-candidate CI is
still required before accepting this new tooling source.

Separately, actual Build Tools36 and JDK17 verified a12,778-byte disposable signed
ARM64 fixture. Five actual checks passed: positive complete inspection, wrong
certificate refusal, reused-version refusal, tampered-APK signature refusal and
rejection of the retained debuggable onService APK. The original signed fixture
hash remained unchanged. This fixture has a distinct package and disposable key;
it is not onService and must never be delivered or installed as the user app.
An initial private harness failed on Windows ESM path syntax before inspection;
only its import URL was corrected, preserving that failed receipt. No real
release key, app data, product APK, server or provider account was changed.

The preceding signing source `dbb2186222182aecc159b44f61ca677f6791b7bd` completed
[CI37982389207](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37982389207)
and [Gates37982389202](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37982389202):
mobile618suites/930tests/84TODO, API1032suites/3652tests/twoTODO with no skips/failures,
admin706tests/one skipped file/threeTODO, types/builds and real API image/health
liveness. Merge41f021a40ea51a50ab63b62e17930320477ce3b8 and that topic share
tree90d992e073c19c9a4f4082366478589ec9bce372. A truncated formatted mobile log was
retained and its omitted final totals recovered from the actual raw job log.
Optional API/admin packaging was skipped, web audit artifact eligibility stayed
false, and no APK was produced. This completes the prior signing-source check,
not verification of this new inspector or the complete-app release.

A prospective first-release identity has separately been retained and verified
privately, outside Git and build artifacts. No published APK uses it yet, and
independent recovery outside its current Windows profile is still unproven.
Do not regenerate it or treat local custody as completed release/backup acceptance.
Real Android Maps configuration, full-app storage acceptance and the standing
APK/update requirements below remain open.

Tool contracts: [Android apksigner verification](https://developer.android.com/tools/apksigner)
and [Android versioning](https://developer.android.com/studio/publish/versioning).

## October 10: reproducible local release signing

An actual Gradle signing report confirmed that the generated release variant
used the shared Android Debug certificate. The explicit local standalone mode
now installs a small Expo configuration plugin that applies the checked-in
`plugins/android-release-signing.gradle` after the existing app build template.
Regeneration must preserve this behavior; editing an ignored generated Gradle
file alone is not the signing implementation. Returning to default/EAS mode
removes this plugin's own application, leaving that mode's signing process alone.

For a selected local standalone build, Gradle requires these process environment
variables, loaded privately outside the source checkout:

- `ONSERVICE_ANDROID_KEYSTORE_PATH`: absolute path to an existing keystore outside
  the build checkout, including after canonical path resolution.
- `ONSERVICE_ANDROID_KEY_ALIAS`, `ONSERVICE_ANDROID_STORE_PASSWORD` and
  `ONSERVICE_ANDROID_KEY_PASSWORD`: the existing private signing material.
- `ONSERVICE_ANDROID_CERT_SHA256`: the independently established public
  certificate fingerprint, exactly64 hexadecimal characters without separators.

Configuration fails closed for missing values, inaccessible/wrong-password stores,
missing private-key aliases, invalid/expired certificates, Android Debug identities
and a fingerprint mismatch. Only the release build type is assigned to the verified
`onserviceRelease` identity. The debug build type is unchanged. This implementation
does not create, rotate, export or reset a key. Keep real values out of command-line
arguments, project env files, generated source, public logs and release artifacts.
Expo never reads these signing values into its public configuration. Android's
signing-report task itself prints key paths and aliases, so real-account reports
must stay private. Use a bounded no-daemon build process when handling credentials.

Local verification uses the real Expo config/mod resolver and actual Gradle9.1.0,
AGP8.12.0 and Android Build Tools36.0.0. The generated wrapper still specifies9.0.0;
these diagnostics are not a claim of exact wrapper reproduction. A disposable
`ph.onservice.signingfixture` APK was assembled and its actual signature/certificate
verified with `apksigner`. It is not the onService application, was not installed,
and must never be delivered as the user APK. Fixture keys are not release keys.
The original offline assembly failed on uncached lint dependencies; the ordinary
online dependency retry retained lint and completed, preserving the failed report.

The full mobile regression run passed618suites/930tests,84existing TODOs and no
skips/failures in218.524seconds. Three new tests execute the actual Expo mod,
including idempotence, switching back to default mode, unsupported-template
rejection and no signing-secret serialization. They do not execute Gradle or a
handset. Initial test-only type errors and an inspection harness that incorrectly
used Expo's plugin-removing `skipPlugins` option were corrected without changing
the assertions or product guards; both failed receipts remain retained. Types,
scoped lint, unchanged GateA10/C7 and seven smoke scripts pass. The actual signing
matrix passed the positive release model and ten rejected configurations: wrong
fingerprint, wrong key password, absent alias, relative path, missing value,
debug identity, renamed debug certificate, key inside the checkout, malformed
fingerprint and bad store password. The debug model stayed unchanged; the private
diagnostic marker was not emitted. One runner inherited exit1 from its final
expected rejection; separate receipt/artifact verification passed without
rewriting that original result. The final focused selection passed five suites/
24tests with no skips/TODOs. Exact-candidate CI is still required before source
acceptance; no local full API/admin or complete-app device result is claimed.

No real release identity, maps credentials, embedded onService release APK,
device storage/authentication, visible-version repair or update feature is
delivered by this prerequisite. Those remain required before a download is offered.

The preceding configuration source a71b06235916761ddc06c08a220204163958652d completed
[CI37979089085](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37979089085)
and [Gates37979089173](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37979089173):
mobile617suites/927tests/84TODO, API1032suites/3652tests/twoTODO and admin706tests
with one skipped file/threeTODO, types/builds and actual API image/health liveness.
API/mobile had no skipped or failed tests. Merge44f490bd38306ea5a28205f054f4f70feb8f4343
and that topic share tree2fed2b6c143a30c36b4ed0bd29859d1f69207e0d. This older result
does not verify the new signing implementation or certify an APK/live release.

## October 10: explicit standalone Android configuration

The build-time selector `ONSERVICE_ANDROID_STANDALONE=1` supports the requested
local Android path without requiring an Expo account or an iOS Maps key.
It declares only the Android platform. `EXPO_OS` must be Android or unset;
conflicting web/iOS targets and `EAS_BUILD=true` are rejected. Default/unset or
`0` preserves the existing multi-platform/EAS requirements and web behavior.

The selected Android Maps key remains mandatory, including prebuild evaluation
in development mode. Empty and known placeholder values fail. An optional EAS
project identity must be a UUID; when absent, no EAS identity or updates URL is
invented. Configured identity metadata alone still does not establish working
push delivery or OTA. No push service, auth/storage behavior, signing key,
permissions, package identity, version code, dependency or gate is changed.

This is prerequisite build configuration for completing the existing storage
and APK acceptance, not a separate finished user feature or a workaround for
the recorded development-server denial. A real Android Maps configuration,
stable release signing, correct API/CAPTCHA configuration, embedded bundle,
increasing release version and actual device/upgrade checks remain mandatory.
The `.env.example` localhost API is for development, not a delivery default.

Actual pre-change evaluation rejected the requested account-free path for
missing EAS identity and, with identity supplied, missing iOS Maps settings.
The initial new-mode contract selection was 16 failed/three passed; these are
new capability/guard expectations, not sixteen claimed pre-existing bugs.
After the change, all19 configuration checks passed, including the unchanged
web export contract. Actual installed Expo SDK55 config introspection also
completed in offline production mode with a synthetic Android Maps fixture,
without generating an APK, configuring any provider account or invoking Metro.
Introspection produced exactly one Android Maps manifest entry with the supplied
synthetic value. This validates plugin configuration, not the credential or maps.
Expo's prebuild command still needs an explicit Android target: its platform
filter may warn and continue on a conflicting command. The selector is not an
absolute native-build isolation or merged-artifact acceptance gate.

The final reviewed local mobile run passed617suites/927tests with84existing
TODOs, zero skips/failures, in211.355seconds. Build configuration and tests stayed
byte-identical during that run. Mobile types, scoped lint, unchanged GateA's ten
fragments, GateC's seven articles and all seven gate smoke scripts passed. No new
local full API/admin run or compiled browser/device acceptance is claimed.
Exact-candidate CI remains required before accepting this new source.

The preceding Android source `442bc89fb7af12df2718860d3d6e3f515acc70e6` completed
[CI37974500862](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37974500862)
and [Gates37974500864](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37974500864):
mobile616suites/909tests/84TODO, API1032suites/3652tests/twoTODO, admin706tests
with one skipped file/threeTODO, types/builds and real API Docker build/health.
API/mobile had zero skipped or failed tests. The blank-database image check
was liveness, not readiness. CI merge9804b35bf18ae8d574599922e6e75bd77116a6d3
and that topic shared tree89b94375e874ae57ab1343c7bc8341be9264f866. This older
green result does not verify the new build-configuration change.

An isolated Android-native MMKV2.4.0 probe additionally passed twelve synthetic
write/reopen/remove/reopen checks, including the existing 44-character key
format. This is evidence against assuming that key must be replaced. It does
not exercise React Native, SecureStore, complete-app initialization, sudden OS
death, a physical phone or APK upgrades. No existing app key/data was changed.
The exact mobile/shared build-input mirror also passed21suites/30tests and
types after staging the verified source; the old debug APK remains unchanged.

## October 10, 2026: reconcile the Android candidate with current verified source

The eleven pending Android paths were preserved in a local commit before
integrating verified marketplace source `bb725efcf661b6af0160e4796b619305976ae46a`
into the existing Android branch. The merge introduced no conflict. Compared
with that marketplace source, only the same eleven Android alignment/storage/
test/documentation paths differ. The shared API wrapper retains both its
current cancellation/no-replay fixes and the native MMKV v4 compatibility fix;
neither side was copied over the other. No primary-branch or live-server update
is part of this integration.

The original OPS534/535 failing evidence and all earlier receipts below remain
valid historical evidence, not acceptance of this combined candidate. The
existing lockfile and storage source hashes were checked unchanged before the
merge. Current combined-source regressions, types, gates, exact-candidate CI
and web compilation must pass before this candidate is source-verified. Native
encryption/persistence, standalone signed ARM packaging, real sign-in and
data-preserving upgrades remain separate required acceptance steps.

The reviewed combined source passed 616 mobile suites / 909 tests, with 84
existing TODOs and no skips or failures (248.924 seconds). The focused storage
and request-policy/cancellation selection passed five suites / thirteen tests
(47.508 seconds), including both OPS534/535 and the newer OPS554 behavior.
Mobile, API and admin TypeScript checks and changed-file lint passed. The
unchanged Gate A ten fragments, Gate C seven articles and all seven gate smoke
scripts passed. Runtime, tests and the dependency lock stayed unchanged through
these checks. These receipts do not replace a fresh full API/admin run, a
compiled web check or exact-candidate CI with this dependency lock. The earlier
API Docker-unavailable failures and device failures below remain historical
failures, not retroactively green results.

The installed native-package versions were also reconciled against Expo
55.0.31's bundled-module matrix. Existing patched React/ReactDOM 19.2.5 and
the intentionally newer Jest/TypeScript versions were retained rather than
downgraded to the matrix recommendations. This metadata comparison and the
regressions are not native binary, cipher or device compatibility acceptance.

Ken reiterated the permanent delivery requirement: keep a verified APK
download available and updated alongside verified releases, with a visible
installed version and an in-app **Check for updates** button. Retain the last
verified APK until its replacement passes. The detailed signing, bounded
automatic/manual checking, Update/Later and upgrade rules below apply. No APK
or updater is delivered merely by publishing this source candidate.

## October 9, 2026 continuation: alignment under verification, no APK release yet

Fresh inspection found `native-build-sdk55-align` at
`e8860b7fc79d854b51d57ac0eae6e1dc591383cb` locally and on the remote. The August
missing-branch observation below is historical. Its old lockfile is not being
copied over the current security/audit dependency history.

The current alignment work starts from `f87b20b325ae1250d0ec70046fe2f04927acc350`
on a separate `codex/android-test-delivery` branch. It targets the SDK 55.0.31
native module matrix, React Native 0.83.10, Reanimated 4.2.1, Worklets 0.7.4 and
the MMKV v4 Nitro peer. Jest 30 and TypeScript 6 remain in place. Expo's Babel
preset automatically configures the Worklets plugin; this repository does not
have a custom Babel file to migrate. These changes still need full web/native
verification before promotion, not merely a successful dependency install.

OPS534 also reproduces a native boot failure against the installed MMKV v4
JavaScript exports: `MMKV is not a constructor`. A local declaration and the
old Jest mock both described v3 APIs and hid the incompatibility. Auth storage,
legacy auth cache and public preferences now use `createMMKV` and `remove`,
with the storage IDs and existing key retrieval unchanged. The misleading MMKV
type declaration is removed so TypeScript uses the library's own types.
The regression runs the installed library's JS exports and its upstream Jest
storage implementation, not our old v3-shaped global mock. It verifies boot
API compatibility, token/user reads and removal, actual legacy-cache writes,
and preferences. It does NOT prove device encryption, restart persistence,
successful sign-in on Android or in-place APK upgrades. Those remain required.

The fresh aligned dependency installation passed the complete mobile run:
596 suites / 880 tests, with 84 existing TODOs and no failures/skips
(139.366 seconds). A preceding trimmed-archive run failed one unchanged test
because it imports admin configuration omitted from that archive. Running in
the complete checkout resolved the setup error without changing its assertions;
the failed report remains retained. Mobile TypeScript and changed-file lint
also passed. The new test title was then normalized to `Bug OPS-534` so the
existing uniqueness gate recognizes it. The final-title storage/migration
rerun passed two suites/eight tests (1.869 seconds). Local Gate A's ten
fragments and Gate C's seven articles passed without changing their sources,
modes or assertions. These local receipts do not replace fresh candidate CI.

The new web export completed with 4,832 modules. Its exact emitted bundle was
opened locally at 1280x720: login and registration rendered, Terms and Privacy
opened their respective documents, the login page had no horizontal overflow,
and no browser console errors were captured. No account data was entered or
registration/OTP request sent. This is bounded signed-out browser compatibility,
not CAPTCHA, authenticated role acceptance, a live deployment or Stitch parity.
The same-lockfile admin regression run passed 706 tests with three existing
TODOs, no failures, in 1,088.958 seconds. The reporter lists 599 files as passed,
but one contains only those three TODOs; it is not executed login-page coverage.
The admin TypeScript and Vite production build also passed (Vite 30.68 seconds).
This is build/regression evidence, not a new admin deployment or authenticated
browser acceptance. The later corrected-layout and native receipts follow.

Subsequent verification-layout correction: the complete checkout initially
linked only root `node_modules`, missing workspace-local packages from the
fresh installation. API typechecking exposed its missing cookie-parser types;
inspection also found admin's pinned nested Sentry/Radix packages were not
visible. The preceding passing reports remain retained, but are not proof of
the complete lockfile-resolved install. Workspace-local dependency links have
now been corrected without changing source, dependencies or assertions. API and
mobile typechecks pass. The corrected full mobile run passed 596 suites/880
tests with 84 TODOs and no failures/skips (229.698 seconds). The corrected admin
TypeScript/production build also passed (Vite 28.41 seconds). Its full regression
rerun has now completed: 706 passing tests, three existing TODOs, zero failed
tests, 1,207.541 seconds. The 599 reported files still include the TODO-only
login-page file. API TypeScript compilation also passes against the corrected
layout. The full API run finished with 1,014 passing suites / 3,507 passing tests,
two TODOs and two failures in 584.195 seconds. Both failures are the unchanged
Nginx checks requiring the unavailable local Docker Linux engine; this is not
a green full run. All 26 refund/participant PostgreSQL checks and all five
token-issuer PostgreSQL cases executed and passed. No test was skipped or
weakened. The temporary owned database was stopped after verifying its identity,
zero generated schemas and no other clients or owned runners; its process and
listener absence were confirmed and its data retained. Fresh exact-candidate
CI and native acceptance remain required.

The Android JavaScript development export separately compiled 5,514 modules
and passed a syntax check. It deliberately omits Hermes bytecode and is not a
release APK or device execution receipt. The first native build failed after
54m57s when Gradle could not snapshot Nitro/Worklets C++ runtime outputs.
Those files shared cloud-tagged hardlinks with the local Android SDK runtime
and older OneDrive build outputs. The three specific directory entries were
replaced with hash-identical regular files, with originals retained and old
shared inodes untouched. The identical bounded build then succeeded in 5m12s
(476 tasks, 80 executed). No output tracking or build check was disabled.

The resulting x86_64 debug APK is 76,397,888 bytes, version 1.0.0/code 1,
application ID `ph.onservice.app`, SHA256
`a3a67cffad7c2a6833cb5066eecb86dfb4c52d03d8b90be306e2f6750969f6d4`.
Android's signing verifier passes with the existing Android Debug certificate.
The APK installed over the existing emulator app with `adb install -r`, without
uninstalling, clearing data or automatically granting permissions. Android
accepted the update and retained the original first-install timestamp. This
does not prove token persistence, a version-increasing upgrade, ARM-device
compatibility or a stable private release-signing identity.

Native launch did not reach the app's JavaScript or sign-in screen. Starting
the local development server was denied by the execution policy; it was not
retried through a different shell, port or serving mechanism. With no server
and no embedded development bundle, the emulator reports `Unable to load
script`. Native MMKV library loading and registration succeeded, but auth
storage creation, encryption, sign-in and restart persistence remain unverified.
The capture also shows a System UI not-responding dialog; its cause has not
been established. The owned emulator was stopped gracefully and its absence
verified, with its app/data and the failure artifacts retained. This debug APK
is not the customer testing download, and no native delivery is claimed.

The production dependency audit is also not clean: 70 flagged entries remain,
including two critical-rated entries already present in the published baseline
(72 entries). No advisory IDs were added by this alignment. Partial caller
review is not remediation; dependency security must be addressed before claiming
production readiness. No blanket audit upgrades or gate exemptions were applied.

Do not change existing device keys as part of an API-name correction. The
current 32-byte/base64 key format and the library's default cipher/key-length
contract require real native compatibility and persistence checks before
delivery. These JavaScript tests do not establish AES256 use or justify a
destructive storage reset if a device test fails.

The previously missed SDK/JDK and June debug APK exist on the development host.
The June APK is stale, debug-signed, and not a delivery artifact. Builds are being
reproduced in a short real directory outside OneDrive, with fresh `npm ci`, not
against the primary checkout's leftover native-aligned `node_modules`.

Remaining delivery requirements include a stable private signing identity,
increasing version codes, correct reachable API configuration, verified role
sign-in/logout/relaunch on Android, update discovery/download/install and
in-place upgrade testing, plus exact source/artifact hashes. The current EAS
preview hostname and native-only environment requirements also need correction
and verification. An Expo account is not required for local Gradle compilation;
that does not make an unsigned APK installable or make EAS push/OTA configured.
Do not expose signing keys or test-account access in Git or download artifacts.

References checked October 9:

- [SDK 55 Reanimated setup](https://docs.expo.dev/versions/v55.0.0/sdk/reanimated/)
- [Local release signing/build](https://docs.expo.dev/guides/local-app-production/)
- Expo 55.0.31 published `bundledNativeModules.json` (SDK-specific matrix).

### Android test delivery rules and open verification

October 9 storage-initialization correction, OPS-535: three concurrent calls to
the real native initializer reproduced three keychain reads, three writes and
three MMKV creations using three distinct keys. The regression uses synthetic
keychain responses and the installed library's own JavaScript/Jest memory
storage. It proves competing initialization, not observed on-device data loss.
The initializer now shares one pending setup operation, retains the existing
saved key and clears failed setup so a later attempt can retry. Failed keychain
reads/writes and factory creation reject all waiters without exposing a usable
store. No existing key, storage ID, cipher, key format or migration policy was
changed. This is another correction within the pending storage initialization
function, not advancement to a different screen or feature.

The original regression failed before correction; the corrected storage/API/
migration selection passed three suites/nine tests (1.217 seconds). The full
mobile run then passed 597 suites/881 tests with 84 existing TODOs, no failures
or skipped tests (211.731 seconds). Mobile TypeScript, changed-file lint and
unchanged Gate A/C passed. These remain local source checks, not native
encryption, restart persistence or authenticated APK acceptance. The retained
debug APK predates OPS-535 and does not contain this new source correction.
All seven unchanged gate smoke scripts also passed, including rejection of
synthetic client imports and duplicate regression IDs; no gate was weakened.

Follow-up artifact verification compiled the corrected Android development
JavaScript (5,514 modules, 129.765 seconds). The emitted source map contains
the exact current native storage source, verified byte-for-byte. A local
diagnostic executes only that emitted Metro module with synthetic keychain/MMKV
boundaries: the old export fails with three distinct keys, while the new export
passes with one, including saved-key reuse and token removal. Both the global
Web Crypto branch and the synthetic Expo Crypto fallback pass. This is compiled
JavaScript behavior, not native encryption or persistence. The installed
Hermes compiler also emitted bytecode successfully; 111 warnings (108 undeclared
globals and three direct-eval warnings) remain in the retained log, not suppressed
or claimed resolved. Neither bundle was served, installed, embedded into the
debug APK or published. The existing APK still predates OPS-535.

Ken's subsequent instruction to fix the issues was taken as permission to
retry the local Android test server once. That normal loopback/offline startup
was again rejected before execution with `blocked by policy`. The remaining
restriction is the execution platform's policy, NOT missing approval from Ken
or an E80 recovery hold. No alternative shell, port, proxy or serving mechanism
was tried. Do not keep asking Ken to approve the same action or claim a server
is running. At that October 9 checkpoint the local correction remained
uncommitted/unpublished alongside the pending alignment; no production service
or account changed. The October 10 integration receipt above supersedes that
source-publication status, not the unresolved native acceptance.

These requirements implement Ken's requested delivery discipline, not a claim
that APK downloads or automatic updates already exist. Complete the current
storage change's native acceptance before changing the next runtime function.

1. **One identifiable release.** Record the reviewed source revision, exact
   dependency lock, API origin, environment, package ID, native version name and
   increasing version code, supported architectures, APK size/hash and public
   signing-certificate fingerprint. Reconcile these with the bytes actually
   served for download. Do not label a dirty build as an unchanged commit or
   substitute API/package version text for the installed binary's version.
2. **Standalone phone build.** The user artifact must support the test phone's
   architecture, contain its application bundle, run without Metro/Expo Go and
   have truthful production configuration. Inspect the merged APK, not just
   source: no development sentinels, debug signing, debuggable flag or test API
   fallback. Review its actual permissions, backup behavior and network rules.
   The existing source placeholder gate excludes native/build outputs and does
   not provide this artifact acceptance.
3. **Stable private signing.** Reuse a verified existing release identity if one
   exists; otherwise establish and securely retain one private identity before
   the first tester release. Keep keys/passwords outside Git and artifacts.
   Never rotate keys or uninstall/erase an existing app to make an upgrade pass.
   The emulator's current Android Debug certificate is not the release identity.
   [Android requires signed APKs and compatible signing identities for updates](https://developer.android.com/studio/publish/app-signing).
4. **Automatic discovery with user-controlled installation.** The account-free
   delivery path is a signed APK download, with an in-app check on launch and
   foreground plus a manual check from Help/Settings. Rate-limit and deduplicate
   checks; an offline/failed check must not block normal startup or report
   "up to date." Preserve active job/payment/form work and offer Update/Later.
   Do not claim silent installation or disable device protections. Android's
   [website-distribution flow requires user opt-in for the download source](https://developer.android.com/distribute/marketing-tools/alternative-distribution).
5. **Small, controlled publication surface.** Prefer a bounded static release
   manifest and immutable APK files on the existing verified HTTPS origin, not
   a new always-on server service or production build workload. Only advertise
   an artifact after its signature, identity, bytes, API compatibility and
   device acceptance pass. Validate manifest schema, package/channel, numeric
   version code, size/hash and approved HTTPS destination; reject malformed
   data, unexpected redirects/origins and downgrade offers. A published checksum
   does not replace Android signature verification. No endpoint or download URL
   is operational merely because it appears in a plan.
6. **Actual upgrade evidence.** Prove first install and a strictly newer build's
   in-place installation with the same release identity, then customer/provider
   sign-in, logout, relaunch, expected session handling and retained legitimate
   app data. Test offline checks, cancellation, duplicate prompts, broken or
   unavailable downloads, wrong certificates and stale manifests. Repeat on a
   supported Android phone; x86_64 emulator installation alone is insufficient.
   [Android version codes identify newer builds and protect against downgrade](https://developer.android.com/studio/publish/versioning).
7. **Safe synchronization and withdrawal.** Apply the paired web/API release
   contract, migration/image rehearsal and authenticated multi-role acceptance
   before advertising a synchronized release. An old installed APK must remain
   compatible during rollout. Withdraw a bad update offer without deleting user
   data or automatically restoring the live database. Correct an installed bad
   release through a reviewed higher-version fix; do not expect a lower-version
   APK to install as rollback. Retain the current and prior known-good release
   evidence and use explicit reviewed retention cleanup, not broad pruning.
8. **Do not confuse binary updates with OTA.** The current project has no
   `expo-updates` dependency or update-check UI. Its EAS URL alone supplies
   neither capability. JavaScript OTA would require a separately configured,
   signed/verified compatible runtime and actual release-device tests; native
   changes still require a new APK. It is not necessary to create an Expo
   account merely to produce the local signed APK delivery path. Follow the
   [Expo local release build guide](https://docs.expo.dev/guides/local-app-production/)
   and, if OTA is later selected, its [SDK 55 update contract](https://docs.expo.dev/versions/v55.0.0/sdk/updates/).

At the October9 checkpoint, config required an EAS project ID and both native Maps keys
for production native evaluation, including Android. The account-free path
therefore needed a reviewed target-specific configuration change and its tests;
the October10 selector above addresses that prerequisite, not APK delivery.
Never supply fake IDs/keys or set a
production delivery build to development mode to defeat these checks.

October 9 artifact-to-render audit: actual `aapt` inspection of the retained
APK reports version `1.0.0`, while both customer and provider Help render
`onService v0.1.0`. Two private real-render diagnostics failed with those exact
expected/received values; no screen or assertion was altered to hide the gap.
These use the repository's mocked native primitives and are not device renders.
The existing help regression only asserts agreement with `platformConfig`, so
it does not establish installed-build identity. The client config bridge can
also override an `appVersion` field from the server; that is not authority for
which APK is installed. This mismatch remains open pending its own correction
and artifact/render/device evidence.

The same audit executed the unchanged source placeholder gate successfully,
then inspected the actual APK manifest: two development-sentinel lines and a
debuggable flag remain. This is expected for the retained development artifact,
not a production artifact passing release validation. The app-config comment then
named a nonexistent `check-mobile-config-no-placeholders.sh`; the actual gate
is `a-cross-source-no-google-maps-placeholder.sh`. Do not use the stale comment
to claim that merged APK configuration has been tested. No gate was changed.

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
