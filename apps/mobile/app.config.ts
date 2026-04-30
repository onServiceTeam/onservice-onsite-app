// Bug 1286 fix verified.
// Phase 14 Dispatch 01.
//
// Replaces the static app.json that shipped placeholder strings like
// "YOUR_GOOGLE_MAPS_API_KEY" and "YOUR_EAS_PROJECT_ID". Those placeholders
// would have ended up baked into release builds, breaking maps in
// production and exposing the slot for accidental commit of real keys.
//
// Required EAS env vars (set via `eas secret:create --scope project`):
//   GOOGLE_MAPS_IOS_API_KEY     — iOS-restricted Google Maps key
//   GOOGLE_MAPS_ANDROID_API_KEY — Android-restricted Google Maps key (SHA1
//                                 fingerprint + package name pinned in GCP)
//   EAS_PROJECT_ID              — the EAS project UUID
//   SENTRY_DSN_MOBILE           — public Sentry DSN for the mobile project
//
// On a local dev machine without these set, the loader still resolves to a
// known-bad sentinel ("DEV_MISSING_<NAME>"). The CI gate at
// scripts/gates/check-mobile-config-no-placeholders.sh refuses to ship a
// build whose merged config contains a sentinel or the legacy placeholders.

import type { ExpoConfig } from 'expo/config';

function reqEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.EAS_BUILD === 'true') {
      throw new Error(
        `Missing required env var ${name}. Set it via "eas secret:create" or your local .env. See apps/mobile/app.config.ts for the list.`,
      );
    }
    return `DEV_MISSING_${name}`;
  }
  return value;
}

const easProjectId = reqEnv('EAS_PROJECT_ID');

const config: ExpoConfig = {
  name: 'onService',
  slug: 'onservice',
  version: '1.0.0',
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  scheme: 'onservice',
  userInterfaceStyle: 'light',
  // newArchEnabled removed in Phase 14 Remediation #2. The field is no
  // longer recognised by Expo SDK 55's ExpoConfig type; new arch is the
  // default for SDK 55+ on iOS/Android so the explicit flag is redundant.
  platforms: ['ios', 'android'],
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#1B3A4B',
  },
  // Phase 14 Remediation #2 — `notification` removed from top-level
  // ExpoConfig in SDK 55. Equivalent settings now live under
  // `android.notification` and the expo-notifications config plugin.
  // The plugin entry below (in `plugins`) supplies the icon + color.
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'ph.onservice.app',
    buildNumber: '1',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'onService needs your location to find nearby service providers and show accurate service areas.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'onService needs your location to provide real-time job tracking and navigation.',
      NSCameraUsageDescription:
        'onService needs camera access to take photos of job sites, receipts, and evidence for disputes.',
      NSPhotoLibraryUsageDescription:
        'onService needs photo library access to upload images for bookings, profiles, and evidence.',
      NSContactsUsageDescription:
        'onService can access your contacts to easily invite friends through the referral program.',
      ITSAppUsesNonExemptEncryption: false,
    },
    associatedDomains: ['applinks:onservice.ph'],
    config: {
      googleMapsApiKey: reqEnv('GOOGLE_MAPS_IOS_API_KEY'),
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1B3A4B',
    },
    package: 'ph.onservice.app',
    versionCode: 1,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'READ_MEDIA_IMAGES',
      'RECEIVE_BOOT_COMPLETED',
      'VIBRATE',
    ],
    config: {
      googleMaps: {
        apiKey: reqEnv('GOOGLE_MAPS_ANDROID_API_KEY'),
      },
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'onservice.ph', pathPrefix: '/booking' },
          { scheme: 'https', host: 'onservice.ph', pathPrefix: '/referral' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'onService needs your location to provide real-time job tracking and navigation.',
        locationWhenInUsePermission:
          'onService needs your location to find nearby service providers.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#1B3A4B',
      },
    ],
  ],
  extra: {
    sentryDsn: process.env.SENTRY_DSN_MOBILE ?? '',
    eas: { projectId: easProjectId },
  },
  owner: 'onservice',
  // typedRoutes experiment disabled in Phase 14 Remediation #2.
  // The `Routes` constant in src/config/navigation.ts (Bug 1185) is the
  // canonical source of route paths; gate `a-cross-source-routes.sh`
  // already enforces no raw-string router calls. Typed-routes added a
  // second source of truth (the .expo/types generated path-string union)
  // that didn't match the registry, producing 123 TS errors on otherwise
  // working navigation. Re-enable when Routes is migrated to `as const`
  // and call sites pass typed-route strings directly.
  experiments: { typedRoutes: false },
  updates: { url: `https://u.expo.dev/${easProjectId}` },
};

export default config;
