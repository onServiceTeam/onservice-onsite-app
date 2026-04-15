import { Stack } from 'expo-router';

export default function ProviderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
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
    </Stack>
  );
}
