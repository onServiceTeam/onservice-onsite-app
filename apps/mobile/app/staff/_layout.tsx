import React from 'react';
import { Stack, useSegments } from 'expo-router';
import { colors } from '@/config/theme';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';

// Bug UX-1383: a customer invited to a provider's team must be able to open
// Team Invitations to accept it (accepting is what makes them staff). Only
// that screen admits a customer; every job screen stays staff-only.
const STAFF_ONLY = ['provider_staff'] as const;
const INVITES = ['provider_staff', 'customer'] as const;

export default function StaffLayout(): React.ReactElement {
  const segments = useSegments() as string[];
  const onInvites = segments[segments.length - 1] === 'invites';
  return (
    <RoleRouteGuard allowedRoles={onInvites ? INVITES : STAFF_ONLY}>
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
