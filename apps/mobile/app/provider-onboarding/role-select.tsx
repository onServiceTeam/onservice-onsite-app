import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { storage } from '@/services/api';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Home as HomeIcon, Wrench } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

import { Routes } from '@/config/navigation';
export default function RoleSelectScreen(): React.ReactElement {
  const router = useRouter();
  const setRole = useOnboardingStore((s) => s.setRole);
  const { isPhone } = useResponsive();

  const handleCustomer = (): void => {
    storage.delete('isNewUser');
    router.replace(Routes.TABS.HOME);
  };

  const handleProvider = (): void => {
    setRole('provider');
    router.push(Routes.PROVIDER_ONBOARDING.CATEGORIES);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View
        style={[styles.content, !isPhone && styles.contentWide]}
        accessibilityLabel={isPhone ? 'Choose how to use onService' : 'Tablet and desktop role selection workspace'}
      >
        <Text style={styles.eyebrow}>CHOOSE YOUR WORKSPACE</Text>
        <Text style={styles.title}>How would you like to use onService?</Text>
        <Text style={styles.subtitle}>Book services now, or begin the reviewed provider application while keeping customer access during review.</Text>

        <View style={[styles.roleGrid, !isPhone && styles.roleGridWide]}>
        <TouchableOpacity
          style={[styles.roleCard, !isPhone && styles.roleCardWide]}
          onPress={handleCustomer}
          activeOpacity={0.7}
        >
          <View style={styles.roleIconWrap}><HomeIcon size={36} color={colors.primary} /></View>
          <View style={styles.roleInfo}>
            <Text style={styles.roleTitle}>I need services</Text>
            <Text style={styles.roleDesc}>
              Book trusted professionals for cleaning, plumbing, electrical, and more.
            </Text>
          </View>
          <Text style={styles.roleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleCard, styles.providerCard, !isPhone && styles.roleCardWide]}
          onPress={handleProvider}
          activeOpacity={0.7}
        >
          <View style={styles.roleIconWrap}><Wrench size={36} color={colors.primary} /></View>
          <View style={styles.roleInfo}>
            <Text style={styles.roleTitle}>I provide services</Text>
            <Text style={styles.roleDesc}>
              Register as a service provider and start earning. NBI clearance and ID required.
            </Text>
          </View>
          <Text style={styles.roleArrow}>→</Text>
        </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  contentWide: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: spacing.xl },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center', marginBottom: spacing.sm },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  roleGrid: { width: '100%' },
  roleGridWide: { flexDirection: 'row', gap: spacing.lg },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  roleCardWide: { flex: 1, minHeight: 180, marginBottom: 0 },
  providerCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  roleIcon: { fontSize: 36, marginRight: spacing.base },
  roleIconWrap: { marginRight: spacing.base, width: 44, alignItems: 'center' as const },
  roleInfo: { flex: 1 },
  roleTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  roleDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },
  roleArrow: { fontSize: 24, color: colors.textTertiary, marginLeft: spacing.sm },
});
