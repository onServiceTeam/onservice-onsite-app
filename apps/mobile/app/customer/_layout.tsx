import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Stack } from 'expo-router';
import { colors } from '@/config/theme';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';

export default function CustomerLayout(): React.ReactElement {
  return (
    <RoleRouteGuard allowedRoles={['customer']}>
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
      <Stack.Screen name="category/[id]" />
      <Stack.Screen name="address-picker" options={{ presentation: 'modal' }} />
      <Stack.Screen name="booking/form" />
      <Stack.Screen name="booking/configure" />
      <Stack.Screen name="booking/checkout" />
      <Stack.Screen name="booking/confirm" />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="booking/tracker" />
      <Stack.Screen name="booking/complete" />
      <Stack.Screen name="booking/review" />
      <Stack.Screen name="booking/tip" />
      <Stack.Screen name="booking/make-recurring" />
      <Stack.Screen name="booking/pay" />
      <Stack.Screen name="booking/payment-failed" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="notification-settings" />
      <Stack.Screen name="search" />
      <Stack.Screen name="provider/[id]" />
      <Stack.Screen name="booking/job-request" />
      <Stack.Screen name="booking/quotes" />
      <Stack.Screen name="booking/dispute" />
      <Stack.Screen name="disputes" />
      <Stack.Screen name="dispute/[id]" />
      <Stack.Screen name="booking/change-order" />
      <Stack.Screen name="booking/photos" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="suki-pros" />
      <Stack.Screen name="safety-and-support" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="payment-methods" />
      <Stack.Screen name="help" />
      <Stack.Screen name="wallet-topup" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="account-management" />
      <Stack.Screen name="data-rights" />
      <Stack.Screen name="business/index" />
      <Stack.Screen name="business/[id]/index" />
      <Stack.Screen name="business/[id]/invoices/[invoiceId]" />
      <Stack.Screen name="recurring/index" />
      <Stack.Screen name="recurring/[id]" />
      <Stack.Screen name="projects/index" />
      <Stack.Screen name="projects/new" />
      <Stack.Screen name="projects/[id]" />
      </Stack>
    </RoleRouteGuard>
  );
}
