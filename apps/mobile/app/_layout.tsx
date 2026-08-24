import React, { useEffect, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { init as sentryInit, wrap as sentryWrap } from '@sentry/react-native';
import { captureException as sentryCaptureException } from '@sentry/core';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/auth.store';
import { fetchPlatformConfig } from '@/services/config.service';
import { initSecureStorage } from '@/services/secure-storage';
import { migrateLegacyTokensIfNeeded } from '@/services/auth-migration';
import { OfflineBanner } from '@/components/ui';
import { AlertHost } from '@/components/ui/AlertHost';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WebAppFrame } from '@/components/WebAppFrame';
import { installWebAlert } from '@/utils/web-alert';
import { PushNotificationGate } from '@/components/PushNotificationGate';
import { AccountQueryCacheGate } from '@/components/AccountQueryCacheGate';

// Make Alert.alert render a real dialog on the web build (react-native-web's
// Alert is a no-op). Installed at module load so it is in place before any
// screen fires an alert. No-op on native.
installWebAlert();

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
      // Auth screens consume admin-owned OTP length/cooldown values. Resolve
      // the bounded public runtime config before exposing those screens so the
      // client contract cannot lag behind a code the API has already sent.
      await fetchPlatformConfig();
      if (!alive) return;
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
        <AccountQueryCacheGate />
        <PushNotificationGate />
        <StatusBar style="dark" />
        {/* A2 — a render error in any screen below shows a recoverable
            fallback instead of white-screening the whole app. */}
        <ErrorBoundary>
          <WebAppFrame>
            <OfflineBanner />
            <AlertHost />
            {/* A3 — mount the toast renderer once at the app root so
                showToast()/showRetryableToast() actually render on native +
                web. Previously only AlertHost (a web-only shim) was mounted,
                so showToast() was silent on devices. */}
            <ToastProvider />
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="provider-onboarding" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="customer" />
              <Stack.Screen name="(provider-tabs)" />
              <Stack.Screen name="provider" />
              {/* Shared in-app support inbox/thread, reachable by both customer
                  and provider through the shared support route. Declared here so the
                  group does not log a "No route named support" warning on boot. */}
              <Stack.Screen name="support" />
              <Stack.Screen name="staff" />
            </Stack>
          </WebAppFrame>
        </ErrorBoundary>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bootLoader: { alignItems: 'center', justifyContent: 'center' },
});

export default sentryDsn ? sentryWrap(RootLayout) : RootLayout;
