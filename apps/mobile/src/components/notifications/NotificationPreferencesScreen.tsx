import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Input, SkeletonCard } from '@/components/ui';
import { ChevronLeft } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { showToast } from '@/lib/toast';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/services/notification.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { getErrorMessage } from '@/utils/errors';

export type NotificationPersona = 'customer' | 'provider';

interface PrefItem {
  key: keyof Pick<
    NotificationPreferences,
    | 'bookingUpdates'
    | 'providerActivity'
    | 'paymentAlerts'
    | 'messages'
    | 'sukiRewards'
    | 'reminders'
    | 'system'
  >;
  label: string;
  desc: string;
}

const CUSTOMER_ITEMS: PrefItem[] = [
  { key: 'bookingUpdates', label: 'Booking updates', desc: 'Status changes, confirmations, and completion records' },
  { key: 'providerActivity', label: 'Provider activity', desc: 'Assignment, en route, arrival, and job updates' },
  { key: 'paymentAlerts', label: 'Payment alerts', desc: 'Verified payment, refund, and escrow status updates' },
  { key: 'messages', label: 'Messages', desc: 'New booking-chat messages from providers' },
  { key: 'sukiRewards', label: 'Suki rewards', desc: 'Points, tier, and loyalty updates' },
  { key: 'reminders', label: 'Booking reminders', desc: 'Upcoming scheduled-service reminders' },
  { key: 'system', label: 'System notices', desc: 'Important service and account notices' },
];

const PROVIDER_ITEMS: PrefItem[] = [
  { key: 'bookingUpdates', label: 'Job and booking updates', desc: 'Assignments, change orders, status changes, and completion records' },
  { key: 'paymentAlerts', label: 'Payout and payment alerts', desc: 'Recorded releases, payout review, and transfer status' },
  { key: 'messages', label: 'Customer messages', desc: 'New booking-chat messages from customers' },
  { key: 'sukiRewards', label: 'Tier and Suki updates', desc: 'Tier progress and repeat-customer activity' },
  { key: 'reminders', label: 'Job and follow-up reminders', desc: 'Upcoming work, NBI expiry, change orders, and client follow-ups' },
  { key: 'system', label: 'System notices', desc: 'Important service, account, and operations notices' },
];

const DEFAULT_PREFS: NotificationPreferences = {
  bookingUpdates: true,
  providerActivity: true,
  paymentAlerts: true,
  messages: true,
  sukiRewards: true,
  reminders: true,
  system: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursTimezone: 'Asia/Manila',
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function NotificationPreferencesScreen({
  persona,
}: {
  persona: NotificationPersona;
}): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);
  const [timeError, setTimeError] = useState('');

  const items = useMemo(
    () => (persona === 'provider' ? PROVIDER_ITEMS : CUSTOMER_ITEMS),
    [persona],
  );
  const essentialKeys = useMemo(
    () => new Set<PrefItem['key']>(['bookingUpdates', 'paymentAlerts', 'system']),
    [],
  );

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: getNotificationPreferences,
  });

  useEffect(() => {
    // A window-focus refresh must not erase choices the user has not saved yet.
    if (data && !dirty) setPrefs(data);
  }, [data, dirty]);

  const saveMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (saved) => {
      queryClient.setQueryData(['notification-preferences'], saved);
      setPrefs(saved);
      setDirty(false);
      setTimeError('');
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      showToast('Your notification preferences have been updated.', 'success');
    },
    onError: (err: unknown) => {
      showToast(getErrorMessage(err, 'Failed to save preferences.'), 'error');
    },
  });

  const togglePref = useCallback((key: PrefItem['key']) => {
    setPrefs((previous) => ({ ...previous, [key]: !previous[key] }));
    setDirty(true);
  }, []);

  const setQuietHours = useCallback((value: boolean) => {
    setPrefs((previous) => ({ ...previous, quietHoursEnabled: value }));
    setDirty(true);
    setTimeError('');
  }, []);

  const setQuietTime = useCallback(
    (key: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
      setPrefs((previous) => ({ ...previous, [key]: value }));
      setDirty(true);
      setTimeError('');
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (
      prefs.quietHoursEnabled
      && (!TIME_PATTERN.test(prefs.quietHoursStart) || !TIME_PATTERN.test(prefs.quietHoursEnd))
    ) {
      setTimeError('Use 24-hour HH:MM times, for example 22:00 and 07:00.');
      return;
    }
    saveMutation.mutate(prefs);
  }, [prefs, saveMutation]);

  const enableAll = useCallback(() => {
    setPrefs((previous) => {
      const updated = { ...previous };
      for (const item of items) updated[item.key] = true;
      return updated;
    });
    setDirty(true);
  }, [items]);

  const disableOptional = useCallback(() => {
    setPrefs((previous) => {
      const updated = { ...previous };
      for (const item of items) updated[item.key] = essentialKeys.has(item.key);
      return updated;
    });
    setDirty(true);
  }, [essentialKeys, items]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.loadingContent, !isPhone && styles.contentWide]}>
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
      contentContainerStyle={[
        styles.content,
        !isPhone && styles.contentWide,
        { paddingTop: insets.top },
      ]}
      accessibilityLabel={
        !isPhone
          ? persona === 'provider'
            ? 'Wide provider notification preference workspace'
            : 'Wide notification preference workspace'
          : undefined
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      {isError && (
        <View style={styles.errorBanner}>
          <ErrorState
            compact
            title="Settings unavailable"
            message="We could not load your saved notification choices. Retry before making changes so existing preferences are not overwritten."
            onRetry={() => void refetch()}
          />
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Notification preferences</Text>
        <Text style={styles.subtitle}>
          Choose which device alerts you want. Your in-app inbox keeps the full activity record.
        </Text>
      </View>

      <View style={styles.deviceNotice}>
        <Text style={styles.deviceNoticeTitle}>
          {Platform.OS === 'web' ? 'Browser notification record' : 'Device notification permission'}
        </Text>
        <Text style={styles.deviceNoticeText}>
          {Platform.OS === 'web'
            ? 'This browser shows your in-app notification history. Device push registration is handled by the signed-in iOS or Android app.'
            : 'The app requests device permission after sign-in. These saved categories control which eligible device alerts are delivered.'}
        </Text>
      </View>

      <View style={styles.marketingNotice}>
        <Text style={styles.marketingNoticeTitle}>Marketing consent is separate</Text>
        <Text style={styles.marketingNoticeText}>
          Promotional push, SMS, and email require recorded consent. This screen cannot change that consent or those channels.
        </Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.quickBtn, isError && styles.controlDisabled]}
          onPress={enableAll}
          disabled={isError}
        >
          <Text style={styles.quickBtnText}>Enable All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickBtn, isError && styles.controlDisabled]}
          onPress={disableOptional}
          disabled={isError}
        >
          <Text style={styles.quickBtnText}>Essentials Only</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        {items.map((item, index) => (
          <View
            key={item.key}
            style={[styles.prefRow, index === items.length - 1 && styles.prefRowLast]}
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
              accessibilityLabel={`${item.label} alerts`}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.prefRowLast}>
          <View style={styles.quietHeader}>
            <View style={styles.prefInfo}>
              <Text style={styles.prefLabel}>Quiet hours</Text>
              <Text style={styles.prefDesc}>Pause optional device alerts during a daily time window.</Text>
            </View>
            <Switch
              value={prefs.quietHoursEnabled}
              onValueChange={setQuietHours}
              disabled={isError}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
              accessibilityLabel="Quiet hours"
            />
          </View>
          {prefs.quietHoursEnabled && (
            <View style={styles.quietBody}>
              <View style={[styles.timeFields, !isPhone && styles.timeFieldsWide]}>
                <View style={styles.timeField}>
                  <Input
                    label="Start time"
                    placeholder="22:00"
                    value={prefs.quietHoursStart}
                    onChangeText={(value) => setQuietTime('quietHoursStart', value)}
                    maxLength={5}
                    error={timeError || undefined}
                  />
                </View>
                <View style={styles.timeField}>
                  <Input
                    label="End time"
                    placeholder="07:00"
                    value={prefs.quietHoursEnd}
                    onChangeText={(value) => setQuietTime('quietHoursEnd', value)}
                    maxLength={5}
                  />
                </View>
              </View>
              <Text style={styles.timezoneText}>Timezone: {prefs.quietHoursTimezone}</Text>
              <Text style={styles.quietNote}>Time-sensitive cancellation, refund, arrival, and dispatch-failure alerts can still be delivered.</Text>
            </View>
          )}
        </View>
      </View>

      {dirty && !isError && (
        <Button
          title={saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
          onPress={handleSave}
          loading={saveMutation.isPending}
          disabled={saveMutation.isPending}
          style={styles.saveButton}
        />
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.xxl },
  contentWide: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: spacing.xl },
  loadingContent: { padding: spacing.base },
  errorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    margin: spacing.base,
    marginBottom: 0,
    overflow: 'hidden',
  },
  header: { paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: spacing.base },
  backBtn: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  deviceNotice: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  deviceNoticeTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  deviceNoticeText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  marketingNotice: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  marketingNoticeTitle: { ...typography.body, color: colors.infoDark, fontWeight: '700' },
  marketingNoticeText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20, marginTop: spacing.xs },
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
  quietHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  quietBody: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },
  timeFields: { gap: spacing.sm },
  timeFieldsWide: { flexDirection: 'row' },
  timeField: { flex: 1 },
  timezoneText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  quietNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  saveButton: { marginHorizontal: spacing.base },
  bottomSpacer: { height: 40 },
});
