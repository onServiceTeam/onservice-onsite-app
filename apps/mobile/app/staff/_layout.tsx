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
      >
        <Stack.Screen name="jobs" />
        <Stack.Screen name="invites" />
        <Stack.Screen name="job/[id]" />
        <Stack.Screen name="job/[id]/checklist" />
        <Stack.Screen name="job/[id]/complete" />
      </Stack>
    </RoleRouteGuard>
  );
}
