import React, { useState, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { usePushNotifications } from '@/services/push.service';
import { platformConfig } from '@/config/platform.config';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

import { Routes } from '@/config/navigation';
export default function ProviderSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { isRegistered, registerForPushNotifications } = usePushNotifications();

  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    setPushEnabled(isRegistered);
  }, [isRegistered]);

  const handlePushToggle = async (enabled: boolean): Promise<void> => {
    if (enabled) {
      const success = await registerForPushNotifications();
      setPushEnabled(success);
      if (!success) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: (): void => { void Linking.openSettings(); } },
          ],
        );
      }
    } else {
      setPushEnabled(false);
    }
  };

  const handleLogout = (): void => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: (): void => {
          logout();
          router.replace(Routes.AUTH.LOGIN);
        },
      },
    ]);
  };

  const handleDeleteAccount = (): void => {
    router.push(Routes.PROVIDER.ACCOUNT_MANAGEMENT);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Name</Text>
            <Text style={styles.rowValue}>
              {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Phone</Text>
            <Text style={styles.rowValue}>{user?.phone ?? '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{user?.email ?? 'Not set'}</Text>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Role</Text>
            <Text style={styles.rowValue}>
              {user?.role === 'provider' ? 'Service Provider' : user?.role ?? '—'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.section}>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLabelGroup}>
              <Text style={styles.rowLabel}>Push Notifications</Text>
              <Text style={styles.rowHint}>Get notified about new jobs and updates</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={(val) => void handlePushToggle(val)}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.SCHEDULE); }}
          >
            <Text style={styles.rowLabel}>Weekly Schedule</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.AVAILABILITY); }}
          >
            <Text style={styles.rowLabel}>Availability Settings</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.CALENDAR); }}
          >
            <Text style={styles.rowLabel}>Calendar View</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.TIER_PROGRESSION); }}
          >
            <Text style={styles.rowLabel}>Tier Progression</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.SERVICES); }}
          >
            <Text style={styles.rowLabel}>Manage Services</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.PORTFOLIO); }}
          >
            <Text style={styles.rowLabel}>Portfolio Photos</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.CERTIFICATIONS); }}
          >
            <Text style={styles.rowLabel}>Certifications</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={(): void => { router.push(Routes.PROVIDER.REVIEWS); }}
          >
            <Text style={styles.rowLabel}>My Reviews</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(Routes.PROVIDER.PAYOUTS)}
          >
            <Text style={styles.rowLabel}>Payout History</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(Routes.PROVIDER.PAYOUT_SETTINGS)}
          >
            <Text style={styles.rowLabel}>Payout Settings</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={() => router.push(Routes.PROVIDER.SUKI_CUSTOMERS)}
          >
            <Text style={styles.rowLabel}>Suki Customers</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>APP</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>{platformConfig.appVersion}</Text>
          </View>
          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={() => router.push(Routes.PROVIDER.HELP)}
          >
            <Text style={styles.rowLabel}>Help & Support</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.logoutRow} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteRow} onPress={handleDeleteAccount}>
            <Text style={styles.deleteText}>Account & Data Management</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 52,
  },
  rowLabelGroup: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.body, color: colors.text },
  rowHint: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  rowValue: { ...typography.body, color: colors.textSecondary },
  rowArrow: { fontSize: 22, color: colors.textTertiary },

  dangerSection: { marginTop: spacing.xl },
  logoutRow: {
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  logoutText: { ...typography.body, color: colors.error, fontWeight: '600' },
  deleteRow: {
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  deleteText: { ...typography.bodySmall, color: colors.textTertiary },
});
