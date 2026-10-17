# App Store Submission Asset Checklist

## Required Assets

The logo is the house (Ken, 2026-10-14). Rules and the SVG masters every
image below is drawn from: `docs/design-system/brand/README.md`. When the mark
changes, regenerate all of these together and check each one by eye.

**Before building an APK after any change here** (an image above, or the
icon, splash or notification settings in `app.config.ts`): regenerate the
native project with `npx expo prebuild -p android --clean`. The `android/`
folder is not in git, and a build that skips prebuild keeps the old icons and
splash inside the APK. After the build, install it on a phone or emulator
and check by eye: the launcher icon, the themed (monochrome) icon on Android
13 and later, the notification icon and the start-up splash, including the
hand-off from the splash tile to the first app screen. Record that check in
the release notes.

### App Icons
- [ ] `assets/icon.png`: 1024x1024px, no transparency, no rounded corners (Expo handles these). Full-bleed #003D9B with a white house.
- [ ] `assets/adaptive-icon.png`: 1024x1024px, Android adaptive icon foreground layer: white house on transparent, inside the 66 of 108 dp safe circle. The #003D9B background colour is set in `app.config.ts`.
- [ ] `assets/adaptive-icon-monochrome.png`: 1024x1024px, Android 13+ themed icon layer: the same white house on transparent (Android tints it).
- [ ] `assets/notification-icon.png`: 96x96px, white house on transparent for Android notifications (no tile)

### Web
- [ ] `public/favicon.ico`: the browser-tab icon. Favicon cut (#003D9B rounded tile, white house at 75% of the tile) drawn at 16, 32 and 48 px, PNG frames; the same file as `apps/admin/src/assets/brand/favicon.ico`. Expo copies it into the web build as is.
- [ ] `public/index.html`: links it as `/favicon.ico?v=<first 8 hex digits of its SHA-256>`. Change the version whenever `favicon.ico` changes, or returning visitors keep the old icon for up to a year (the web server caches `.ico` files that long). `__tests__/bug-ux-1429-web-favicon-versioned-link.test.ts` fails until it matches. Do not set `web.favicon` in `app.config.ts`: Expo would then add a second, unversioned link.
- [ ] `assets/favicon.png`: 48x48px, the 48 px frame of `public/favicon.ico`, byte for byte. The legal pages embed it as their PNG tab icon.

### Splash Screen
- [ ] `assets/splash-icon.png`: 1024x1024px, square and transparent: white tile with the #003D9B house, 62.5% of the width. Expo draws it 200 dp wide on the #003D9B splash background (about 125 dp of tile). Replaced the tall 1284x2778px `splash.png` (2026-10-17), which showed the logo far too small on Android.

### Google Play Store Screenshots (per locale)
- [ ] `store-listing/en/screenshots/phone-1.png` — 1080x1920px or 1242x2208px
- [ ] `store-listing/en/screenshots/phone-2.png`
- [ ] `store-listing/en/screenshots/phone-3.png`
- [ ] `store-listing/en/screenshots/phone-4.png`
- [ ] `store-listing/en/screenshots/phone-5.png` (min 2, max 8)
- [ ] `store-listing/en/feature-graphic.png` — 1024x500px (required for Google Play)

### Apple App Store Screenshots (per device, per locale)
- [ ] iPhone 6.7" (1290x2796px) — min 3 screenshots
- [ ] iPhone 6.5" (1242x2688px) — min 3 screenshots
- [ ] iPhone 5.5" (1242x2208px) — min 3 screenshots

### Recommended Screenshot Content
1. Home screen with service categories
2. Booking flow — selecting a service
3. Provider matching or quote comparison
4. Real-time tracking / job in progress
5. Payment confirmation with escrow badge
6. Suki loyalty program / rewards screen
7. Provider profile with ratings
8. Dispute resolution flow

## Required Credentials & Accounts

### Google Play
- [ ] Google Play Developer account ($25 one-time fee)
- [ ] Google Service Account JSON key for automated submissions (`google-service-account.json`)
- [ ] App signing key enrolled in Google Play App Signing
- [ ] Content rating questionnaire completed
- [ ] Data safety section filled out
- [ ] Target API level ≥ 35 (Android 15)

### Apple App Store
- [ ] Apple Developer Program enrollment ($99/year)
- [ ] App Store Connect app record created
- [ ] Certificates and provisioning profiles configured (EAS handles this)
- [ ] App Privacy details completed in App Store Connect
- [ ] Age rating questionnaire completed
- [ ] Export compliance information submitted (ITSAppUsesNonExemptEncryption: true — qualifies for §740.17(b)(1) standard exemption since the app uses encryption ONLY for authentication, HTTPS, and protection of user data via established libraries; annual self-classification report due to BIS / NSA on calendar-year build)

## Pre-Submission Verification

### Functional
- [ ] All deep links work (onservice.ph/booking/*, onservice.ph/referral/*)
- [ ] Push notifications received on both platforms
- [ ] Payment flow completes end-to-end in staging
- [ ] Location permissions requested at appropriate time (not on launch)
- [ ] Camera/photo permissions requested only when needed
- [ ] App works offline gracefully (shows cached data or appropriate message)

### Compliance
- [ ] Privacy policy accessible at https://onservice.ph/privacy
- [ ] Terms of service accessible at https://onservice.ph/terms
- [ ] Data deletion mechanism available (Settings > Account > Delete Account)
- [ ] No placeholder content or "Coming Soon" on critical screens
- [ ] No references to "test", "debug", or "localhost" in production build
- [ ] All third-party SDK disclosures listed in privacy manifests

### Performance
- [ ] App launches in < 3 seconds on mid-range device
- [ ] No ANR (Application Not Responding) events
- [ ] Memory usage stays under 200MB during normal usage
- [ ] No excessive battery drain from background processes
- [ ] Images are optimized (WebP where possible)

## Build & Submit Commands

```bash
# Build for internal testing
eas build --profile preview --platform all

# Build for production
eas build --profile production --platform all

# Submit to Google Play (internal track)
eas submit --profile preview --platform android

# Submit to Apple App Store
eas submit --profile production --platform ios

# Submit to Google Play (production, draft)
eas submit --profile production --platform android
```
