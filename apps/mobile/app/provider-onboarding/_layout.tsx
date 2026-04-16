import React from 'react';
import { Stack } from 'expo-router';

export default function ProviderOnboardingLayout(): React.ReactElement {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="role-select" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="service-area" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="selfie" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="review-pending" />
    </Stack>
  );
}
