import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/config/theme';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';

export default function StaffLayout(): React.ReactElement {
  return (
    <RoleRouteGuard allowedRoles={['provider_staff']}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          headerStyle: { backgroundColor: colors.surfaceMuted },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
        }}
      />
    </RoleRouteGuard>
  );
}
