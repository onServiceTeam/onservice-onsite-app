import React, { useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-115 fix — DEPRECATED screen, now a redirect.
//
// Pre-fix: this file was kept on disk but flagged as deprecated in
// the K06 audit because the active KYC flow lives in documents.tsx
// + selfie.tsx + terms.tsx (uploads via /api/v1/uploads, then submit
// via /api/v1/providers/apply). The body of this screen submitted
// base64-in-JSON to /provider-onboarding/identity which does not
// exist on the backend. Anyone who reached this route via a stale
// deep link or back-stack hit a 404.
//
// Post-fix: redirect on mount to /provider-onboarding/documents,
// the active KYC entry. Body kept as a fallback for the few frames
// before navigation lands. Same K06/K10 redirect pattern used to
// retire skills.tsx (CRIT-110).
//
// The IDENTITY_VERIFICATION route constant in src/config/navigation.ts
// remains for backward compatibility with any external link, but
// nothing in-tree references it.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Routes } from '@/config/navigation';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export default function IdentityVerificationScreen(): React.ReactElement {
  const router = useRouter();

  useEffect(() => {
    router.replace(Routes.PROVIDER_ONBOARDING.DOCUMENTS);
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          The identity verification step has moved. You will be taken to
          the Documents step where you can upload your government ID and
          NBI clearance.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace(Routes.PROVIDER_ONBOARDING.DOCUMENTS)}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Go to Documents</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.h2, color: colors.text, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.lg,
  },
  btnText: { ...typography.button, color: colors.white },
});
