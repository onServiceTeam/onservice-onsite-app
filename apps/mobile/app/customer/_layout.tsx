import React from 'react';
import { Stack } from 'expo-router';

export default function CustomerLayout(): React.ReactElement {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="category/[id]" />
      <Stack.Screen name="address-picker" options={{ presentation: 'modal' }} />
      <Stack.Screen name="booking/form" />
      <Stack.Screen name="booking/checkout" />
      <Stack.Screen name="booking/confirm" />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="booking/tracker" />
      <Stack.Screen name="booking/complete" />
      <Stack.Screen name="booking/review" />
      <Stack.Screen name="booking/tip" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="search" />
      <Stack.Screen name="provider/[id]" />
      <Stack.Screen name="booking/job-request" />
      <Stack.Screen name="booking/quotes" />
      <Stack.Screen name="booking/dispute" />
      <Stack.Screen name="booking/change-order" />
      <Stack.Screen name="booking/photos" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="suki-pros" />
      <Stack.Screen name="safety" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="help" />
      <Stack.Screen name="wallet-topup" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="account-management" />
      <Stack.Screen name="data-rights" />
    </Stack>
  );
}
