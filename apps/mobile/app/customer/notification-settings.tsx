import React, { useState, useCallback, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
// A7 — shared UI kit for loading state + toast feedback.
import { SkeletonCard } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { useResponsive } from '@/hooks/useResponsive';

interface NotificationPrefs {
  bookingUpdates: boolean;
  providerActivity: boolean;
  paymentAlerts: boolean;
  messages: boolean;
  promotions: boolean;
  sukiRewards: boolean;
  reminders: boolean;
  system: boolean;
}

interface PrefItem {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
}

const PREF_ITEMS: PrefItem[] = [
  { key: 'bookingUpdates', label: 'Booking Updates', desc: 'Status changes, confirmations, completions' },
  { key: 'providerActivity', label: 'Provider Activity', desc: 'Provider en route, arrived, job updates' },
  { key: 'paymentAlerts', label: 'Payment Alerts', desc: 'Payment confirmations, refunds, escrow releases' },
  { key: 'messages', label: 'Messages', desc: 'New chat messages from providers' },
  { key: 'sukiRewards', label: 'Suki Rewards', desc: 'Points earned, tier upgrades, loyalty benefits' },
  { key: 'reminders', label: 'Booking Reminders', desc: 'Upcoming scheduled service reminders' },
  { key: 'system', label: 'System Notifications', desc: 'App updates, maintenance, important notices' },
];

const ESSENTIAL_KEYS: Set<keyof NotificationPrefs> = new Set(['bookingUpdates', 'paymentAlerts', 'system']);

const DEFAULT_PREFS: NotificationPrefs = {
  bookingUpdates: true,
  providerActivity: true,
  paymentAlerts: true,
  messages: true,
  promotions: false,
  sukiRewards: true,
  reminders: true,
  system: true,
};

export default function NotificationSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: NotificationPrefs }>('/api/v1/notifications/preferences');
      return res.data.data;
    },
  });

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (newPrefs: NotificationPrefs) => {
      const res = await api.put<{ success: boolean; data: NotificationPrefs }>(
        '/api/v1/notifications/preferences',
        newPrefs,
      );
      return res.data.data;
    },
    onSuccess: (saved) => {
      setPrefs(saved);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      showToast('Your notification preferences have been updated.', 'success');
    },
    onError: (err: unknown) => {
      // Phase K MED-K04 fix — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to save preferences.'), 'error');
    },
  });

  const togglePref = useCallback((key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    saveMutation.mutate(prefs);
  }, [prefs, saveMutation]);

  const enableAll = useCallback(() => {
    const updated: NotificationPrefs = { ...prefs };
    for (const item of PREF_ITEMS) updated[item.key] = true;
    setPrefs(updated);
    setDirty(true);
  }, [prefs]);

  const disableOptional = useCallback(() => {
    const updated: NotificationPrefs = { ...prefs };
    for (const item of PREF_ITEMS) updated[item.key] = ESSENTIAL_KEYS.has(item.key);
    setPrefs(updated);
    setDirty(true);
  }, [prefs]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, !isPhone && styles.contentWide, { paddingTop: insets.top }]}
      accessibilityLabel={!isPhone ? 'Wide notification preference workspace' : undefined}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      {isError && (
        <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, margin: 16, marginBottom: 0 }}>
          <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load notification settings. Retry before making changes so saved choices are not overwritten.</Text>
        </View>
      )}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Notification Settings</Text>
        <Text style={styles.subtitle}>
          Choose which device alerts you want. Your in-app inbox keeps the full activity record.
        </Text>
      </View>

      <View style={styles.marketingNotice}>
        <Text style={styles.marketingNoticeTitle}>Marketing alerts are off</Text>
        <Text style={styles.marketingNoticeText}>
          Promotional push, SMS, and email require a separate recorded consent. This screen cannot enable them.
        </Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={[styles.quickBtn, isError && styles.controlDisabled]} onPress={enableAll} disabled={isError}>
          <Text style={styles.quickBtnText}>Enable All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quickBtn, isError && styles.controlDisabled]} onPress={disableOptional} disabled={isError}>
          <Text style={styles.quickBtnText}>Essentials Only</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        {PREF_ITEMS.map((item, idx) => (
          <View
            key={item.key}
            style={[styles.prefRow, idx === PREF_ITEMS.length - 1 && styles.prefRowLast]}
          >
            <View style={styles.prefInfo}>
              <Text style={styles.prefLabel}>{item.label}</Text>
              <Text style={styles.prefDesc}>{item.desc}</Text>
            </View>
            <Switch
              value={prefs[item.key]}
              onValueChange={() => togglePref(item.key)}
              disabled={isError}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        ))}
      </View>

      {dirty && !isError && (
        <TouchableOpacity
          style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saveMutation.isPending}
        >
          <Text style={styles.saveBtnText}>
            {saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Push notifications require permission on your device. You can also manage notification
          permissions in your phone's Settings app.
        </Text>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.xxl },
  contentWide: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: spacing.xl },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: spacing.base },
  backBtn: { marginBottom: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },

  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  controlDisabled: { opacity: 0.5 },

  marketingNotice: { backgroundColor: colors.infoLight, borderWidth: 1, borderColor: colors.info, borderRadius: borderRadius.lg, padding: spacing.base, marginHorizontal: spacing.base, marginBottom: spacing.base },
  marketingNoticeTitle: { ...typography.body, color: colors.infoDark, fontWeight: '700' },
  marketingNoticeText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20, marginTop: spacing.xs },

  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  prefRowLast: { borderBottomWidth: 0 },
  prefInfo: { flex: 1, marginRight: spacing.md },
  prefLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  prefDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  saveBtn: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.base,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { ...typography.button, color: colors.white },

  infoBox: {
    backgroundColor: colors.infoLight,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  infoText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20 },

  bottomSpacer: { height: 40 },
});
