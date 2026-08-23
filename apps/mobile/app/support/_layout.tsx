import React from 'react';
import { Stack } from 'expo-router';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';

// Shared in-app support group, reachable by customers, provider owners, and
// provider staff. The route guard prevents anonymous or admin-role sessions
// from mounting the app workspace; the API still enforces ticket ownership.
export default function SupportLayout(): React.ReactElement {
  return (
    <RoleRouteGuard allowedRoles={['customer', 'provider', 'provider_staff']}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </RoleRouteGuard>
  );
}
