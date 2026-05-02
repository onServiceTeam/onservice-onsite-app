import React, { useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-110 fix — DEPRECATED screen.
//
// Pre-fix problems:
//   1. The category/subcategory list was hardcoded in the screen
//      (12 categories, ~5 subs each). The real categories live in
//      the database `categories` and `subcategories` tables and are
//      managed by admins via the catalog admin tools. The hardcoded
//      ids ('cleaning-general', 'plumb-leak', etc.) do not match
//      any real subcategory_id, so nothing the user toggled here
//      could ever round-trip back to a real provider_services row.
//   2. The save handler POSTed to `/api/v1/providers/me/skills`,
//      which does not exist on the backend. Every save returned 404
//      and the toast just said "Save failed" — looked like a
//      transient error but the screen has been broken since day 1.
//   3. The "skills" concept duplicates Services Management (where
//      the provider toggles which subcategories they offer AND sets
//      basePrice per subcategory). The Services screen at
//      app/provider/services.tsx fetches real categories from
//      /api/v1/categories and writes via /api/v1/providers/me/services
//      (which actually exists). That is the canonical surface.
//
// Post-fix: redirect any caller landing on this route to the real
// services screen so the user lands somewhere that works rather than
// somewhere that silently 404s on save. Same K06 pattern used to
// retire the orphan provider-onboarding/identity-verification screen.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export default function ProviderSkillsScreen(): React.ReactElement {
  const router = useRouter();

  // Redirect on mount. The visible UI below is only seen for the
  // brief frame before the navigation lands, plus as a fallback if
  // navigation is somehow blocked.
  useEffect(() => {
    router.replace('/provider/services');
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.title}>Manage Your Services</Text>
        <Text style={styles.subtitle}>
          The Skills page has moved. You can pick which services you
          offer and set your prices on the Services page.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace('/provider/services')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Go to Services</Text>
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
