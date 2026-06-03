# Testing onService across devices (PC, Android, iOS) and on the web

This guide explains how to test all three experiences — **customer**,
**provider**, and **company admin** — on a Windows PC, Android phones, iPhones,
and in a web browser, both **locally** (on your own machine, today) and
**online** (against the live server, once DNS + HTTPS are set up).

## The three experiences and where they run

| Experience | Mobile app (Android/iOS) | Web browser |
|---|---|---|
| **Customer** | Yes (primary) | Yes — the same app rendered in a browser* |
| **Provider** | Yes (primary) | Yes — the same app rendered in a browser* |
| **Company admin / back office** | No | **Yes — this is a real web app** |

\* Customer and provider are **one app** that shows the right screens based on
who logs in. It runs in a browser via Expo's web mode. **Caveat:** four
map-based screens (address picker, live tracker, provider active-job map,
provider service-area) use a mobile-only map component and will be blank or
error in a browser. Everything else (browse, book, pay, quotes, jobs,
earnings, chat, profile, etc.) works in a browser. For a fully polished
customer/provider **web product**, a dedicated web front end is a later build;
browser mode today is great for testing the core flows.

The **admin** site is a true web app and works in any browser on any device.

---

## Level 1 — Test everything on your own machine, today (free, no DNS)

This uses the local setup from `docs/TESTING-GUIDE.md` (Docker + the three dev
servers). Demo login code is **`000000`**. Three terminals:

```
./scripts/dev/up.ps1                      # backend + DB + demo data
npm run dev --workspace=apps/admin        # admin web → http://localhost:7382
npm run start --workspace=apps/mobile     # customer/provider app (Expo)
```

Then:

- **Admin (PC web):** open `http://localhost:7382` in Chrome/Edge. Log in with
  the bootstrapped admin account.
- **Customer/Provider in a PC browser:** in the Expo terminal press **`w`**.
  It opens the app in your browser. Log in with a customer phone
  (`+639171234567`) or a provider phone (`+639251234567`) and code `000000`.
- **Customer/Provider on your real Android phone or iPhone:** install **Expo
  Go** from the Play Store / App Store, make sure the phone is on the **same
  Wi-Fi** as your PC, and scan the QR code shown in the Expo terminal. To let
  the phone reach your PC, start mobile with your PC's network address:
  ```
  $env:EXPO_PUBLIC_API_URL = "http://<your-PC-LAN-IP>:7381"
  npm run start --workspace=apps/mobile
  ```
  (Find `<your-PC-LAN-IP>` with `ipconfig` — the IPv4 like `192.168.1.50`.)
- **Android emulator on the PC (optional):** install Android Studio, create a
  device, then press **`a`** in the Expo terminal.
- **iPhone:** on Windows there is **no iOS simulator** (that needs a Mac). Use
  **Expo Go on a real iPhone** (scan the QR) — this is the easy iOS path.

This lets one person be the customer (browser), another the provider (phone),
and watch a booking move between them, with the admin watching in a third
window. It's the fastest way to test the whole flow.

---

## Level 2 — Test online in a browser, from anywhere (after DNS + HTTPS)

Once the DNS records point at the server and I've issued SSL, these public URLs
work from any device, anywhere — no install, just a browser:

- **Admin / back office:** `https://admin.onservice.ph`
- **Customer + provider (web):** `https://app.onservice.ph`  *(I deploy this
  alongside the admin site once DNS is live; same map-screen caveat as above)*
- The apps talk to the live API at `https://api.onservice.ph`.

This is the easiest way to give testers and staff access: send them a link.
On staging it still uses the `000000` demo login; on production it switches to
real SMS codes.

---

## Level 3 — Test the real installable mobile apps, online (the true device test)

To put the actual app on testers' phones (not Expo Go), use Expo's build
service (**EAS** — already configured in `apps/mobile/eas.json`). The builds
point at the live API (`https://api.onservice.ph`).

- **Android (.apk for direct install / internal testing):**
  ```
  cd apps/mobile
  npx eas build --profile preview --platform android
  ```
  EAS returns a download link; testers install the APK directly, or you push it
  to **Google Play internal testing** for a Play-Store-like experience.
- **iOS (TestFlight):**
  ```
  npx eas build --profile preview --platform ios
  npx eas submit --platform ios
  ```
  Testers install via **TestFlight**. **Requires an Apple Developer account
  ($99/year).** This is the only way to test a real iOS app from a Windows
  machine (no Mac needed — EAS builds in the cloud).
- A free EAS account covers low build volumes; heavy use needs a paid plan.

**Recommended for a serious test round:** Android APK/Play-internal + iOS
TestFlight, both pointed at the live staging API. Testers download, log in, and
exercise real flows on real phones.

---

## Quick reference: who tests what, where

| Tester role | Easiest way today (local) | Easiest way online |
|---|---|---|
| Customer | PC browser (`w`) or Expo Go on phone | `https://app.onservice.ph` or TestFlight/APK |
| Provider | Expo Go on a second phone | `https://app.onservice.ph` or TestFlight/APK |
| Admin / support | `http://localhost:7382` | `https://admin.onservice.ph` |
| QA team (real devices) | — | EAS APK + TestFlight against live API |

---

## What still has to happen before Level 2/3 online testing

1. **DNS records added at GoDaddy** (you — the one remaining manual step).
2. SSL issued + HTTPS switched on (me, automatic after DNS).
3. Admin site + customer/provider web deployed at their URLs (me, after DNS).
4. For Level 3 iOS: an Apple Developer account; for Android: a Google Play
   developer account if you want Play-store internal testing (APK direct-install
   needs neither).
5. For real payments/SMS in testing: your PayMongo **test-mode** keys and a
   Semaphore key (until then, staging uses the `000000` demo login and payments
   are simulated).
