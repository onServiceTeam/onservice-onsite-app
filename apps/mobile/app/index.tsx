import React, { useEffect, useRef } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { colors, typography, spacing } from '@/config/theme';
import { storage } from '@/services/api';
import { DEMO_MODE, demoLogin, isDemoRole } from '@/config/demo';
import BrandMark, { BRAND_BLUE } from '@/components/BrandMark';

import { Routes } from '@/config/navigation';

// Bug UX-1432: this screen takes over from the Android splash, so it draws
// the logo tile at the splash tile's size and place. The splash
// (app.config.ts: assets/splash-icon.png, which Expo draws in a 200 dp square,
// with the white tile across 62.5% of it) shows the tile about 125 dp wide,
// centred on the screen, on the fixed #003D9B splash background. This screen
// uses the same size, the same centre and the same fixed brand blue, with the
// wordmark and tagline placed below the tile, so the logo does not shrink or
// jump when the app starts. Worked out from Expo's build code; not yet seen on
// a device. Regenerating splash-icon.png at another size means changing this
// number too (__tests__/bug-ux-1432-start-screen-matches-splash.real.test.tsx
// checks it).
const SPLASH_TILE_DP = 125;

export default function SplashScreen(): React.ReactElement {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  // Demo deep-link: app.onservice.ph/?demo=customer|provider auto-signs-in to
  // the matching seeded account (staging demo builds only). Fired once.
  const params = useLocalSearchParams<{ demo?: string }>();
  const demoFired = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (
      DEMO_MODE &&
      !isAuthenticated &&
      !demoFired.current &&
      isDemoRole(params.demo)
    ) {
      demoFired.current = true;
      // On success the auth state flips and this effect re-runs to route by
      // role; on failure, fall through to the normal login routing below.
      demoLogin(params.demo).catch(() => {
        demoFired.current = false;
      });
      return;
    }

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        if (user?.role === 'provider') {
          router.replace(Routes.PROVIDER_TABS.DASHBOARD);
        } else if (user?.role === 'provider_staff') {
          router.replace(Routes.STAFF.JOBS);
        } else {
          router.replace(Routes.TABS.HOME);
        }
      } else {
        const hasOnboarded = storage.getBoolean('hasOnboarded');
        if (hasOnboarded) {
          router.replace(Routes.AUTH.LOGIN);
        } else {
          router.replace(Routes.AUTH.ONBOARDING);
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, user, router, params.demo]);

  return (
    <View style={styles.container} testID="start-screen">
      {/* Bug UX-1420: the house logo (white tile on brand blue), replacing the
          retired "oS" letters. */}
      <BrandMark tone="onDark" size={SPLASH_TILE_DP} testID="start-brand-mark" />
      <View style={styles.wordmarkBlock} testID="start-wordmark-block">
        <Text style={styles.appName}>onService PH</Text>
        <Text style={styles.tagline}>Home services, done right.</Text>
      </View>
      <ActivityIndicator size="large" color={colors.white} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The tile is the only child in the layout flow, so it sits at the centre
  // of the screen, like the splash tile. No safe-area padding here: it would
  // move the centre down.
  container: {
    flex: 1,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Below the tile, with clear space of at least 25% of the tile between them
  // (brand README): 32 px under a 125 px tile.
  wordmarkBlock: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: SPLASH_TILE_DP / 2 + spacing.xl,
    alignItems: 'center',
  },
  appName: {
    ...typography.h1,
    color: colors.white,
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  tagline: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
  },
  loader: { position: 'absolute', bottom: 80 },
});
