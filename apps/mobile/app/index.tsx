import React, { useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { colors, typography, spacing } from '@/config/theme';
import { storage } from '@/services/api';

import { Routes } from '@/config/navigation';
export default function SplashScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

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
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.logoContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>oS</Text>
        </View>
        <Text style={styles.appName}>onService</Text>
        <Text style={styles.tagline}>Home services, done right.</Text>
      </View>
      <ActivityIndicator size="large" color={colors.white} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: { alignItems: 'center' },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.white,
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
