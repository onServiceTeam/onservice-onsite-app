import React from 'react';
import { Stack } from 'expo-router';

// Shared in-app support group, reachable by both customer and provider
// (through Routes.SUPPORT.INBOX). Auth is enforced by the API; both personas use
// the same owner-scoped support-ticket endpoints.
export default function SupportLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
