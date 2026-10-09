// Bug 1286 fix verified.
// Phase 14 Dispatch 01.
//
// Replaces the static app.json that shipped placeholder strings like
// "YOUR_GOOGLE_MAPS_API_KEY" and "YOUR_EAS_PROJECT_ID". Those placeholders
// would have ended up baked into release builds, breaking maps in
// production and exposing the slot for accidental commit of real keys.
//
// Default native/EAS builds require the native values below. Explicit local
// Android builds may select ONSERVICE_ANDROID_STANDALONE=1: Android Maps stays
// mandatory, iOS Maps is irrelevant, and EAS identity is optional. No identity
// means no configured Expo push/OTA service, not a production-readiness claim.
//   GOOGLE_MAPS_IOS_API_KEY     — iOS-restricted Google Maps key
//   GOOGLE_MAPS_ANDROID_API_KEY — Android-restricted Google Maps key (SHA1
//                                 fingerprint + package name pinned in GCP)
//   EAS_PROJECT_ID              — the EAS project UUID
//   SENTRY_DSN_MOBILE           — public Sentry DSN for the mobile project
//
// On a local dev machine without these set, the loader still resolves to a
// known-bad sentinel ("DEV_MISSING_<NAME>"). The CI gate at
// scripts/gates/a-cross-source-no-google-maps-placeholder.sh checks source.
// Actual merged APK configuration/signing still needs artifact verification.

import type { ExpoConfig } from 'expo/config';

const standaloneSelection = process.env.ONSERVICE_ANDROID_STANDALONE;
if (standaloneSelection !== undefined && standaloneSelection !== '0' && standaloneSelection !== '1') {
  throw new Error('Invalid ONSERVICE_ANDROID_STANDALONE: expected 0 or 1.');
}
const standaloneAndroid = standaloneSelection === '1';
if (standaloneAndroid && process.env.EXPO_OS !== undefined && process.env.EXPO_OS !== 'android') {
  throw new Error('Local standalone Android requires EXPO_OS to be android or unset.');
}
if (standaloneAndroid && process.env.EAS_BUILD === 'true') {
  throw new Error('Local standalone Android cannot be combined with EAS_BUILD.');
}

function reqEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    if (standaloneAndroid || process.env.NODE_ENV === 'production' || process.env.EAS_BUILD === 'true') {
      throw new Error(
        `Missing required env var ${name}. Set it via "eas secret:create" or your local .env. See apps/mobile/app.config.ts for the list.`,
      );
    }
    return `DEV_MISSING_${name}`;
  }
  // Prebuild can evaluate in development mode. Explicit standalone builds
  // must never quietly bake a development sentinel into their native config.
  if (standaloneAndroid && /^(DEV_MISSING_|YOUR_)/i.test(value.trim())) {
    throw new Error(`Invalid required env var ${name}: placeholder values are not allowed.`);
  }
  return standaloneAndroid ? value.trim() : value;
}

// A web export cannot use the native Google Maps keys or EAS Update project.
// Requiring those native-only values made `expo export -p web` impossible on a
// deployment machine that correctly had only the web build variables. Expo
// sets EXPO_OS for the target platform; our deploy command also sets it
// explicitly so config evaluation is deterministic.
const isWebExport = process.env.EXPO_OS === 'web';
const easProjectId = isWebExport || standaloneAndroid
  ? process.env.EAS_PROJECT_ID?.trim()
  : reqEnv('EAS_PROJECT_ID');
if (standaloneAndroid && easProjectId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(easProjectId)) {
  throw new Error('Invalid EAS_PROJECT_ID: expected a project UUID.');
}

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
  platforms: standaloneAndroid ? ['android'] : ['ios', 'android', 'web'],
  // Phase 200 — web (browser) build for customer/provider testing. SPA
  // output (single index.html + client-side routing) served by nginx at
  // app.onservice.ph. Native-only modules (maps, secure-store, MMKV, push)
  // have .web shims; see src/web-stubs/ and the *.web.ts variants.
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#003D9B',
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
      // Phase K MED-K24 fix — the app uses non-exempt encryption
      // (MMKV with AES-256 encryption key per CRIT-K01 fix; HTTPS
      // for all backend traffic; expo-crypto for OTP hashing). Per
      // BIS export compliance, ITSAppUsesNonExemptEncryption MUST
      // be `true` and the app must qualify for the standard
      // exemption (uses encryption ONLY for authentication and
      // protection of user data with established cryptography
      // libraries). Setting this honestly avoids App Store
      // rejection and qualifies for ENS exemption per
      // §740.17(b)(1) of the EAR. Operator MUST also submit the
      // annual self-classification report to BIS / NSA on the
      // same calendar year the build ships.
      //
      // If your build genuinely is exempt (no encryption beyond
      // OS/HTTPS), set this back to false AND document why in
      // store-listing/ASSET-CHECKLIST.md.
      ITSAppUsesNonExemptEncryption: true,
    },
    associatedDomains: ['applinks:onservice.ph'],
    ...(!isWebExport && !standaloneAndroid && {
      config: {
        googleMapsApiKey: reqEnv('GOOGLE_MAPS_IOS_API_KEY'),
      },
    }),
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
      backgroundColor: '#003D9B',
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
    ...(!isWebExport && {
      config: {
        googleMaps: {
          apiKey: reqEnv('GOOGLE_MAPS_ANDROID_API_KEY'),
        },
      },
    }),
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
    ['./plugins/withLocalAndroidSigning.js', { enabled: standaloneAndroid }],
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
        color: '#003D9B',
      },
    ],
  ],
  extra: {
    sentryDsn: process.env.SENTRY_DSN_MOBILE ?? '',
    ...(easProjectId && { eas: { projectId: easProjectId } }),
    // Phase 200 — pin the Expo Router root to the real route directory `app/`.
    // A stray empty `src/app/` placeholder used to win Expo's auto-detection
    // (it prefers `src/app` over `app` when both exist), which produced an
    // empty route context and a "No routes found" crash on the web export.
    // Pinning it here makes route discovery deterministic on every platform.
    router: { root: 'app' },
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
  ...(easProjectId && { updates: { url: `https://u.expo.dev/${easProjectId}` } }),
};

export default config;
