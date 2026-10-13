# D39: In-app APK updater (new Expo module and install permission)

Status: **Option A applied, Ken can veto.** Written by Claude 2026-10-14 during
the HA-UPD work from the 2026-10-13 human audit. Ken's audit message asked for
the update bug to be found and fixed ("investigate and find all the problems
pertaining to this one too") and for a new APK the testers can install. Option A
is the only option that actually fixes what he reported, the module is Expo's
own free SDK 55 module, and the permission is limited to the sideloaded tester
build, so Claude treated his instruction as the go-ahead and built 1.0.3 with
it. If Ken prefers B or C, the change is contained in the files listed below
and can be reverted in one commit.

## Why this exists

Ken's audit note: "1.0.1 is not updating itself to 1.0.2 ... keeps saying
Update available". Builds 1.0.1 and 1.0.2 only hand the download to the
browser and never check whether Android installed it. The most likely cause is
that an older onService APK still in Downloads gets opened and "reinstalled",
so the phone stays on the old build.

The fix (HA-UPD, in the working tree, not yet released) makes the app download
the APK itself, check it, open Android's installer, and say honestly when the
install did not happen. Two things in it are normally Ken's call under
CLAUDE.md hard stop 3:

1. **A new external dependency: `expo-intent-launcher` 55.0.16.** It is the
   official Expo module for opening Android screens (MIT licence, made by the
   Expo team, the version that matches our Expo SDK 55). The app uses it to
   open Android's installer and the "Install unknown apps" switch for
   onService. Android only; on the web build it is never loaded.
2. **A sensitive Android permission: `REQUEST_INSTALL_PACKAGES`.** Without it,
   Android 8 and later silently cancel an install started from inside the app.
   It is added ONLY to the standalone tester APK (`ONSERVICE_ANDROID_STANDALONE=1`
   in `apps/mobile/app.config.ts`). **Google Play forbids this permission for an
   app that updates itself.** A Play Store build must not have it, and when we
   move to Play Store, Play's own updates replace this updater.

## Options

- **A (recommended): approve both.** Testers get updates that install from
  inside the app, with a clear "did not finish" screen and a browser fallback.
- **B: no new module, keep the browser updater** with better help text and the
  file name to open. Small change, but the app still cannot tell whether the
  install worked, which is the bug Ken reported.
- **C: write our own small native Android module instead of the Expo one.**
  Same permission needed, more code for us to own, no benefit for testers.

## What Ken needs to answer

- Approve A, or pick B or C.

## Release checklist for 1.0.3 (the first build that can update itself)

Phones on 1.0.1 and 1.0.2 keep the old browser updater. Every tester installs
1.0.3 by hand once; only updates after that install from inside the app.

1. Ken approves this decision.
2. Raise the version to 1.0.3 and the build number to 4 in
   `apps/mobile/app.config.ts`, and the expected build number in
   `apps/mobile/__tests__/android-standalone-config.test.ts`.
3. Build with `ONSERVICE_ANDROID_STANDALONE=1` (this is what adds the permission).
4. Run `scripts/release/inspect-android-apk.mjs` on the signed APK. Since
   2026-10-14 it refuses an APK without `REQUEST_INSTALL_PACKAGES`
   (checked: it refuses the real 1.0.1 and 1.0.2 APKs).
5. Deploy the API first (it accepts the new optional `md5` field), then run
   `scripts/release/publish-android-apk.sh` on the server. The publish script
   also refuses an APK without the permission, and puts the previous manifest
   back if the API does not advertise the new one.
6. Publish with release notes that tell testers on the old updater what to do,
   for example: "Before installing: delete older onService APK files from your
   Downloads folder, then open onService-1.0.3-4.apk. From this version on,
   updates install from inside the app." (Under 500 characters.)
7. Test on a real phone: 1.0.2 to 1.0.3 by hand, then publish a 1.0.4 test
   build and confirm the in-app update on at least one phone, including one
   where "Install unknown apps" starts switched off.

## Known limits (not fixed by this work)

- Nothing has been tried on a real phone yet (all tests use stand-ins).
- The md5 check only catches damaged downloads. It is not a security check;
  Android's same-signing-key rule is what stops a different build replacing
  the app.
- JavaScript cannot ask Android in advance whether installs from onService are
  allowed, so the app relies on Android's prompt and the "did not finish" help.
- Admin cannot see testers whose update did not finish.
