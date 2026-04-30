import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { init as sentryInit, wrap as sentryWrap } from '@sentry/react-native';
import { captureException as sentryCaptureException } from '@sentry/core';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/auth.store';
import { usePushNotifications } from '@/services/push.service';
import { fetchPlatformConfig } from '@/services/config.service';
import { initSecureStorage } from '@/services/secure-storage';
import { migrateLegacyTokensIfNeeded } from '@/services/auth-migration';
import { OfflineBanner } from '@/components/ui';

const sentryDsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
if (sentryDsn) {
  sentryInit({
    dsn: sentryDsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableAutoSessionTracking: true,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function PushNotificationGate(): null {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { isRegistered, registerForPushNotifications } = usePushNotifications();

  useEffect(() => {
    if (isAuthenticated && !isRegistered) {
      void registerForPushNotifications();
    }
  }, [isAuthenticated, isRegistered, registerForPushNotifications]);

  return null;
}

function RootLayout(): React.ReactElement {
  const hydrate = useAuthStore((s) => s.hydrate);
  // Bug 1061 fix: secure storage MUST be initialized BEFORE the auth store
  // hydrates, because hydrate() reads tokens synchronously from secure-storage.
  // We block the UI behind a brief activity indicator until init resolves
  // (typical: <100ms once expo-secure-store has the cached key from prior
  // launches; first launch generates the key once which adds another ~50ms).
  const [secureStorageReady, setSecureStorageReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initSecureStorage();
        await migrateLegacyTokensIfNeeded();
      } catch (err) {
        // If secure storage fails, capture to Sentry but do not block boot —
        // the app falls through to a logged-out state and the user can sign
        // in fresh. Without this guard, a corrupted keychain would brick the
        // app on launch.
        sentryCaptureException(err);
      }
      if (!alive) return;
      hydrate();
      // Phase 03 — pull runtime platform config; failures fall back silently to defaults.
      void fetchPlatformConfig();
      setSecureStorageReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [hydrate]);

  if (!secureStorageReady) {
    return (
      <View style={[styles.root, styles.bootLoader]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <PushNotificationGate />
        <OfflineBanner />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="provider-onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="customer" />
          <Stack.Screen name="(provider-tabs)" />
          <Stack.Screen name="provider" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bootLoader: { alignItems: 'center', justifyContent: 'center' },
});

export default sentryDsn ? sentryWrap(RootLayout) : RootLayout;
