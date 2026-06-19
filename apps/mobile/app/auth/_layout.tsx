import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Stack } from 'expo-router';
import { colors } from '@/config/theme';

export default function AuthLayout(): React.ReactElement {
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
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="otp-verify" />
    </Stack>
  );
}
