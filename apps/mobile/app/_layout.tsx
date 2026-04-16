import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { usePushNotifications } from '@/services/push.service';
import { OfflineBanner } from '@/components/ui';

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

export default function RootLayout(): React.ReactElement {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
});
