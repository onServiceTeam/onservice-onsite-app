import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Stack } from 'expo-router';
import { colors } from '@/config/theme';

export default function ProviderLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: colors.surfaceMuted },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="job/[id]" />
      <Stack.Screen name="job/active" />
      <Stack.Screen name="schedule" />
      <Stack.Screen name="services" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="withdraw" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="payouts" />
      <Stack.Screen name="reviews" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="job/[id]/quote" />
      <Stack.Screen name="job/[id]/change-order" />
      <Stack.Screen name="job/[id]/checklist" />
      <Stack.Screen name="job/[id]/photos" />
      <Stack.Screen name="account-management" />
    </Stack>
  );
}
