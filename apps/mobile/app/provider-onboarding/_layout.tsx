import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase K CRIT-K06 fix — onboarding stack now declares
// background-check-status (the post-submit polling screen, now wired
// to real /api/v1/providers/application-status per CRIT-K07 fix).
// identity-verification.tsx remains undeclared because the active
// flow uses the documents + selfie + terms upload chain (writing to
// /api/v1/uploads + /api/v1/providers/apply); identity-verification
// posted base64-in-JSON to a /provider-onboarding/identity endpoint
// that doesn't exist on the backend. The orphan file is documented
// as deprecated in its header comment.
import { Stack } from 'expo-router';
import { colors } from '@/config/theme';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';
import { ProviderOnboardingDraftGuard } from '@/components/ProviderOnboardingDraftGuard';
import { ProviderApplicationSessionGate } from '@/components/ProviderApplicationSessionGate';

export default function ProviderOnboardingLayout(): React.ReactElement {
  return (
    <RoleRouteGuard allowedRoles={['customer']}>
      <ProviderApplicationSessionGate>
      <ProviderOnboardingDraftGuard>
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
          <Stack.Screen name="role-select" />
          <Stack.Screen name="categories" />
          <Stack.Screen name="service-area" />
          <Stack.Screen name="vetting" />
          <Stack.Screen name="documents" />
          <Stack.Screen name="selfie" />
          <Stack.Screen name="terms" />
          <Stack.Screen name="review-pending" />
          <Stack.Screen name="background-check-status" />
        </Stack>
      </ProviderOnboardingDraftGuard>
      </ProviderApplicationSessionGate>
    </RoleRouteGuard>
  );
}
