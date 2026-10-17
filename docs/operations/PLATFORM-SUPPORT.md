# Platform support

Written 2026-10-14 as part of adopting the engineering standard (D40, standard
section P, backlog item BL-01). It describes master `8d319a18`, which is what
runs on the live tester server and in APK 1.0.5. Re-checked and corrected on
2026-10-17 (admin access in section 3, the manifest minimum in section 1, and
Ken's decided items in section 7), and again that evening (the admin
screenshot widths in section 3, the Google Play wording).

This is a record of what exists and what has been checked. It is not a promise
to customers. Nothing in it is enforced by GitHub: GitHub protection is off by
Ken's choice (D40).

Every Status column uses the `CLAUDE.md` status words (Proposed, Implemented,
Verified, Deployed, Production verified, Blocked / Deferred). How something
was checked goes in the Evidence column. A row for something nobody has
built or proposed says so plainly instead. Nothing here is Production
verified, because there is no real-customer production yet.

## Summary

| Surface | Used by | Status | Versions | How it updates |
|---|---|---|---|---|
| Android tester app (APK, installed by hand) | Customers, providers, provider team members | Deployed (tester download link, APK 1.0.5) | Current build 1.0.5 (build 6). Needs Android 7.0 (API level 24) or newer. Built for Android 16 (API level 36). ARM phones only (64-bit and 32-bit). | In-app updater from 1.0.3. Browser download on 1.0.1 and 1.0.2. None on 1.0.0. |
| Customer and provider web app (`app.onservice.ph`) | The same people, in a browser | Deployed (tester server, `8d319a18`) | No supported browser list has been declared. | A page reload loads the new files. |
| Admin console (`admin.onservice.ph`) | Office staff and the DPO | Deployed (tester server, `8d319a18`) | No supported browser list has been declared. Checked only in Chromium on Windows, at the widths each screenshot spec sets (768 to 1920 px wide). Phone widths are not tested. | A page reload loads the new files. |
| Android app on Google Play | Nobody | Deferred. Ken chose the wording "Google Play listing coming soon" for the homepage (section 7). Whether and when to list is open. Nothing built. | | |
| iOS app | Nobody | Deferred (Ken's cost and scope decision, section 4). Nothing built. | | |
| Desktop app | Nobody | None: nothing built or proposed. | | |

## 1. Android tester app

**What it is.** One Expo app (`apps/mobile`) that shows customer, provider or
team-member screens depending on who signs in. It is built on Ken's computer
(private release records), signed with the onService PH release key, and
installed by hand from a download link. It is not in Google Play.

**Builds published to testers:** 1.0.1 (build 2), 1.0.2 (3), 1.0.3 (4),
1.0.4 (5) and 1.0.5 (6). An earlier 1.0.0 (build 1) exists and has no update
check (`LAUNCH-LIMITATIONS.md` section 128).

**Android versions.** Minimum Android 7.0 (API level 24). Target API level 36
(Android 16). How this was checked: on 2026-10-14, `aapt dump badging` on the
local copies of 1.0.1, 1.0.3 and 1.0.5 reported `sdkVersion:'24'` and
`targetSdkVersion:'36'`. The inspector records for 1.0.4 and 1.0.5 (private
records, not in the repo) say the same. The release inspector refuses any APK
whose minimum is below 24 (`scripts/release/inspect-android-apk.mjs:69`).

**Phone types.** The APKs contain native code for `arm64-v8a` and
`armeabi-v7a` (same `aapt` check). Phones or emulators that only run x86 code
are not covered.

**Signing.** Every build is signed with one release key. The app only offers
updates signed with the pinned certificate
(`apps/mobile/src/services/app-update.service.ts`), and Android itself refuses
a build signed with any other key. There is one custody copy of the key. A
backup outside the current Windows profile has not been proven
(`docs/qa/NATIVE-BUILD-REQUIREMENTS.md:86-89`). If the key is lost, no future
update can install over phones that already have the app.

**Differences from what a customer might expect:**

| Feature | On the Android app today | Source |
|---|---|---|
| Push notifications | Not working. There is no Firebase project, so providers see new requests only while the app is open. The 5 and 10 minute admin alerts are the safety net. | `LAUNCH-LIMITATIONS.md` sections 131 and 132 |
| Maps | Native Google Maps. A Maps key is built into each APK. Not checked on a real phone. | `apps/mobile/app.config.ts` |
| Voice notes | Recorded in the app. | `LAUNCH-LIMITATIONS.md` section 132 |
| Videos | Chosen through the system photo picker. | `apps/mobile/app.config.ts` |
| Install permission | `REQUEST_INSTALL_PACKAGES` is in the tester build only. Google Play forbids it for an app that updates itself, so a Play build must drop it. | `apps/mobile/app.config.ts`; D39 |
| Data on the phone | Sign-in tokens and the user record are kept in encrypted storage and cleared at sign-out. | `apps/mobile/src/services/secure-storage.ts`; `DATA-INVENTORY.md` |

### How updates reach phones

1. A build is checked by `scripts/release/inspect-android-apk.mjs`, then
   published on the server with `scripts/release/publish-android-apk.sh`.
   Version codes must strictly increase.
2. The server answers `GET /api/v1/app-releases/android/latest` with a small
   manifest (never cached). Each APK file is served under its own versioned
   name and is never replaced (`packages/api/src/routes/app-release.routes.ts`).
3. The app checks when it opens and when it comes back to the front, at most
   every 30 minutes. Help and provider Settings have a "Check for updates"
   button (`LAUNCH-LIMITATIONS.md` section 128).
4. From 1.0.3 the app downloads the APK itself, checks its size and
   fingerprint, opens Android's installer, and says plainly when the install
   did not finish (section 131). On 1.0.1 and 1.0.2 the app hands the download
   to the browser. On 1.0.0 there is no check at all.

### Two separate "please update" mechanisms

They are easy to confuse, and today they disagree.

**A. `minimumVersionCode` in the update manifest.** If the installed build is
below it, the app shows "Update required" with no Later button
(`apps/mobile/src/components/AppUpdateGate.tsx:119`, `:191`). The server
refuses a manifest whose minimum is above the build it offers
(the `minimumVersionCode above versionCode` check in
`packages/api/src/routes/app-release.routes.ts`). Builds 1.0.3 and 1.0.4 were published with a
minimum of 1 (private release records). The 1.0.5 record does not state the
value. A read-only look at the public update manifest during the handover
review of 2026-10-16/17 saw version 1.0.5 (build 6) with a minimum of 1
(private records). That is one reading, not a standing check. With a minimum
of 1, every update prompt can be dismissed.

**B. `APP_UPDATE_REQUIRED` from the API.** Apps older than 1.0.4 send quotes
without an earliest date and declines without a reason. The server answers
`400 APP_UPDATE_REQUIRED` with the message "Please update the onService app
to send quotes." or "Please update the onService app to decline a quote."
(`packages/api/src/routes/booking.routes.ts:33-47`, used at `:1215` and
`:1332`; tests `packages/api/__tests__/ha-m2-31-old-app-quote-needs-update.test.ts`
and `packages/api/__tests__/ha-m2-35-decline-needs-reason.test.ts`). The
server spots an old app by the missing field. It does not read a version
number. The apps have no special screen for this code, so an old app shows
whatever its general error handling does with that message. What an
installed 1.0.3 actually displays has not been checked.

**The disagreement.** While the minimum stays at 1, a provider on 1.0.3 can
tap Later on the update prompt (A) and then find they cannot send a quote (B).

### Known problems on older builds

- 1.0.2 and 1.0.3 keep the old live-connection code, so live chat can stop and
  fall back to slower updates. The server still accepts these apps (repair item
  R-ACC-05).
- Chat photos sent from 1.0.2 and 1.0.3 go to the public upload area, which
  anyone with the link can open. The server still accepts them (R-ACC-12).
- Phones on 1.0.1 and 1.0.2 must install a newer build by hand once, after
  deleting older onService APK files from Downloads (section 131).

### Compatibility window

**Status: Proposed. Not adopted.** No support window is published today, and
old builds are retired only by release notes and a prompt that can be
dismissed. Proposed rule (backlog item BL-09; a default Ken can veto):

1. The server keeps working for the current and the previous published APK.
2. When a server change needs a newer app, the same release raises
   `minimumVersionCode` to the first compatible build, and the server answers
   `APP_UPDATE_REQUIRED` to the old behaviour.
3. `minimumVersionCode` is raised only after an in-app update has worked on a
   real phone. Otherwise testers could face an update prompt they cannot close
   and cannot complete.
4. Builds older than the window are retired by that required prompt. Builds
   1.0.0 to 1.0.2 cannot install an update from inside the app and need one
   manual install.

## 2. Customer and provider web app (`app.onservice.ph`)

**What it is.** The same code as the Android app, exported for browsers as one
page (`apps/mobile/app.config.ts`, `web.output: 'single'`). Browser-only
replacements exist for push, maps, secure storage and the APK installer
(`apps/mobile/src/services/*.web.ts`, `apps/mobile/src/web-stubs/`).

**Browsers.** No supported list has been declared. What exists: screen render
tests in jsdom (not a real browser) and local visual checks at 375 px wide
against a stand-in API (private release records). Nothing has been checked in
Safari, Firefox or a phone browser.

**What is different or switched off on the web:**

| Feature | On the web today | Why |
|---|---|---|
| Push notifications | Not available. New requests show only while the page is open. | There is no browser version of the push module (`push.service.web.ts`). |
| Voice note recording | Off on the live site. The app explains this instead of failing. | The live web server still runs a configuration from 2026-08-24 (`LAUNCH-LIMITATIONS.md` section 132). The repo versions from that date block the microphone. The current repo version allows it (`nginx/nginx.conf:429`), but applying it means a supervised reload of a web server shared with other businesses, which needs Ken (`LAUNCH-LIMITATIONS.md` section 132). |
| Playing a picked or recorded video or voice note before sending | Off on the live site. | The 2026-08-24 configuration lacks the `media-src 'self' blob:` rule that the current repo version adds (`nginx/nginx.conf:73-78`). |
| Camera | Blocked. | `camera=()` in the current repo configuration and in the 2026-08-24 versions. |
| Device location | Blocked. The address picker still invites people to use their device location, and a provider cannot mark "I've arrived" in a browser. | `geolocation=()` in the current repo configuration (`nginx/nginx.conf:429`) and in the 2026-08-24 versions. Open as repair item R-ACC-12. The test `packages/api/__tests__/ha-m2-111-nginx-blocks-job-media-and-allows-microphone.test.ts` pins the current setting, so the fix changes that test too. |
| Maps | A location preview, not an interactive map. | `apps/mobile/src/web-stubs/react-native-maps.tsx`; `docs/TESTING-ACROSS-DEVICES.md` |
| Sign-in storage | Browser local storage, not encrypted. | `apps/mobile/src/services/secure-storage.web.ts` says a production web app would need a hardened approach. |
| Updates | A reload loads new files. Old files stay on the server so open tabs keep working. | `docs/runbooks/paired-web-api-release.md` |

## 3. Admin console (`admin.onservice.ph`)

**What it is.** A React web app (`apps/admin`) for office staff and the DPO.

**Who can reach it.** See `LAUNCH-LIMITATIONS.md` section 135 (a tracked
tester-server weakness, E07; Ken decision 15). (Corrected 2026-10-17: an
earlier draft of this file said the console "sits behind a separate site
password and a network allowlist", copying a sentence in section 129 that is
not true.)

**Browsers and screens.** No supported list has been declared. The 588
screenshot baselines (re-captured and reviewed at `18097e1f`) were captured
with Playwright's default browser (Chromium) on Windows, at the widths each
spec sets: 768 (14 baselines), 820 (64), 1024 (64), 1280 (154), 1440 (146)
and 1920 (146) px wide (widths counted from the baseline file names with
`git ls-files`), 800 or 900 px high (set in each spec). The 1280 x 800 in
`apps/admin/playwright.config.ts:16` is only the default for a spec that sets
no size. CI does not run these checks. Phone widths are not a
declared target and have not been tested. (Corrected 2026-10-17 evening; the
earlier text said every baseline was at 1280 x 800.)

**Known layout problems:** Notification Templates scrolls sideways below about
1185 px wide, and at 1024 px the Dispatch Console bookings table hides its
Actions column (`LAUNCH-LIMITATIONS.md` section 132).

**Dispatch map.** The map background comes from OpenStreetMap tiles. The
content rules the web server sends for the admin site do not list the tile
host, so the background tiles are probably blocked on the live admin. This has
not been checked in a browser against live. See `INTEGRATIONS.md`.

## 4. iOS

Not built. `apps/mobile/app.config.ts` still lists iOS for non-tester builds,
with tablets switched off, but no iOS build or decision record exists. An iOS
build needs an Apple Developer account and either a Mac or cloud builds. That
is a cost and scope decision for Ken. iOS checks are out of scope until then.

## 5. Desktop

There is no desktop app and no plan on record for one. The desktop part of
standard section P does not apply.

## 6. What is checked and what is not

| Claim | Evidence | Status |
|---|---|---|
| APK minimum Android 7.0, target API level 36, ARM 64 and 32 bit | `aapt dump badging` on the local 1.0.1, 1.0.3 and 1.0.5 APK files, run 2026-10-14 | Verified (by command, on those three APK files) |
| The server refuses an old app's quote or decline with `APP_UPDATE_REQUIRED` and an update message | API tests `ha-m2-31-old-app-quote-needs-update.test.ts` (quote) and `ha-m2-35-decline-needs-reason.test.ts` (decline); both passed in CI run 38555374628 on `8d319a18` | Verified (server side, `8d319a18`). What an installed 1.0.3 shows has not been checked. |
| In-app updater logic | Mobile tests with stand-ins (D39): `apk-update-check.real.test.tsx` and `apk-update-install.real.test.tsx` passed in CI run 38555374628 on `8d319a18`. Never run on a real phone. | Implemented. Stand-in tests pass; the real-phone check (BL-20) is not done. |
| In-app update from one build to the next on a real phone | None (`LAUNCH-LIMITATIONS.md` section 132; BL-20) | Blocked (needs a real phone) |
| Anything on a real phone | None | Blocked (needs a real phone) |
| Web app in real browsers, on phones or desktops | Local checks at 375 px with a stand-in API only. No real browser list checked. | Deployed. Not verified in real browsers. |
| Admin console in Chromium at the widths the specs set (768 to 1920 px) | Local screenshot run at `18097e1f`, Windows only, 588 baselines (section 3). CI does not run it. Phone widths not tested. | Verified (locally, `18097e1f`) |
| Current `minimumVersionCode` on the live manifest | Read once, during the 2026-10-16/17 handover review: 1.0.5 (build 6), minimum 1 (private records). Repeat checks outside a release wait on register row R4, which is not granted until Ken decides. | Verified once, by reading the manifest (2026-10-16/17). No standing check (R4). |
| Admin dispatch map tiles on live | Not loaded in a browser against live. Reading the config suggests the tiles are blocked (section 3). | Deployed. Tiles on live not verified. |

Emulator results are not counted as phone evidence for any row above
(`docs/qa/NATIVE-BUILD-REQUIREMENTS.md`).

## 7. Decisions for Ken

**Already decided by Ken (2026-10-14), recorded here on 2026-10-17:**

- **Google Play: "Google Play listing coming soon".** For the public homepage,
  Ken chose a "Download for Android" button that downloads the APK directly,
  with the words "Google Play listing coming soon" and no Google Play badge
  until the app is really listed. That is a wording choice for the homepage.
  Whether and when to list on Google Play is open, and the direct APK
  download stays the channel until then. Also open:
  the Play developer account (a new vendor and spending, register Class 3
  item 6), and what happens to the self-updater and the install permission in
  the Play build (section 1, "Install permission"). The homepage itself is a
  separate job and is not live.
- **One logo: the house.** The onService PH logo is the house mark, the same
  everywhere: customer, Service Provider and admin screens, favicons, the
  Android app icon and splash, the homepage, emails and PDFs. It replaces every
  "oS" tile and the old app icon. There is no orange in the mark. Changing the
  app icon needs a new APK. That work is a separate job and is not done: APK
  1.0.5 still has the old icon.

**Still open:**

1. Launch platforms: Android only, or Android and iOS (iOS has a yearly cost).
2. Whether and when to list on Google Play (see above), and whether the
   self-updater stays for tester builds if it is listed.
3. A Firebase project, so Android push notifications can work.
4. A supervised window to reload the shared web server, so web voice notes and
   previews work. The same reload could carry an allow rule for device location
   on the web app (R-ACC-12).
5. The compatibility window above (BL-09). The adoption record lists it as a
   default that Ken can veto.
6. An encrypted backup of the release signing key, kept off this computer.
7. One real-phone test of the in-app update (BL-20).
