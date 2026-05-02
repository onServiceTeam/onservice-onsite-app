# App Store Submission Asset Checklist

## Required Assets

### App Icons
- [ ] `assets/icon.png` — 1024x1024px, no transparency, no rounded corners (Expo handles these)
- [ ] `assets/adaptive-icon.png` — 1024x1024px, Android adaptive icon foreground layer
- [ ] `assets/notification-icon.png` — 96x96px, white on transparent for Android notifications

### Splash Screen
- [ ] `assets/splash.png` — 1284x2778px (optimized for iPhone 14 Pro Max, scales down)

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
