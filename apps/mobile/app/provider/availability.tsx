import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAvailabilityOverrides,
  addAvailabilityOverride,
  removeAvailabilityOverride,
  getAvailabilityStatus,
  toggleAvailability,
  type AvailabilityOverride,
} from '@/services/provider-api.service';
import { Button } from '@/components/ui';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle, Calendar, ClipboardList } from '@/components/icons';

import { Routes } from '@/config/navigation';
export default function AvailabilitySettingsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideType, setOverrideType] = useState<'block' | 'custom'>('block');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { data: isAvailable, isLoading: loadingStatus, isError: statusError, isRefetching: statusRefetching } = useQuery({
    queryKey: ['availability-status'],
    queryFn: getAvailabilityStatus,
  });

  const { data: overrides = [], isLoading: loadingOverrides, isError: overridesError, isRefetching: overridesRefetching } = useQuery({
    queryKey: ['availability-overrides'],
    queryFn: (): Promise<AvailabilityOverride[]> => getAvailabilityOverrides(),
  });

  const invalidateAll = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['availability-status'] });
    void queryClient.invalidateQueries({ queryKey: ['availability-overrides'] });
    void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
  }, [queryClient]);

  const toggleMutation = useMutation({
    mutationFn: (available: boolean) => toggleAvailability(available),
    onSuccess: () => { invalidateAll(); },
    onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err, 'Operation failed.')),
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      overrideDate: string; isAvailable: boolean; startTime?: string; endTime?: string; reason?: string;
    }) => addAvailabilityOverride(data),
    onSuccess: () => {
      invalidateAll();
      resetForm();
      Alert.alert('Saved', 'Availability override added.');
    },
    onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err, 'Operation failed.')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeAvailabilityOverride(id),
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Removed', 'Override removed.');
    },
    onError: (err: unknown) => Alert.alert('Error', getErrorMessage(err, 'Operation failed.')),
  });

  const resetForm = useCallback((): void => {
    setShowAddForm(false);
    setOverrideDate('');
    setOverrideReason('');
    setOverrideType('block');
    setStartTime('');
    setEndTime('');
  }, []);

  const handleToggle = useCallback((value: boolean): void => {
    toggleMutation.mutate(value);
  }, [toggleMutation]);

  const handleAddOverride = useCallback((): void => {
    if (!overrideDate.trim()) {
      Alert.alert('Required', 'Please enter a date (YYYY-MM-DD).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideDate.trim())) {
      Alert.alert('Invalid Date', 'Please use format YYYY-MM-DD.');
      return;
    }
    const isCustomAvailable = overrideType === 'custom';
    addMutation.mutate({
      overrideDate: overrideDate.trim(),
      isAvailable: isCustomAvailable,
      startTime: isCustomAvailable && startTime.trim() ? startTime.trim() : undefined,
      endTime: isCustomAvailable && endTime.trim() ? endTime.trim() : undefined,
      reason: overrideReason.trim() || undefined,
    });
  }, [overrideDate, overrideReason, overrideType, startTime, endTime, addMutation]);

  const handleRemoveOverride = useCallback((item: AvailabilityOverride): void => {
    Alert.alert('Remove Override', `Remove the override for ${item.overrideDate}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: (): void => { removeMutation.mutate(item.id); } },
    ]);
  }, [removeMutation]);

  const isLoading = loadingStatus || loadingOverrides;
  const isError = statusError || overridesError;
  const isPending = addMutation.isPending;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <View style={{ marginBottom: 12, alignItems: 'center' }}><AlertTriangle size={48} color={colors.error} /></View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load availability settings. Please try again.</Text>
        <TouchableOpacity onPress={() => { void invalidateAll(); }} style={{ backgroundColor: colors.secondary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, minHeight: 44, justifyContent: 'center' as const }}>
          <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const futureOverrides = overrides.filter((o) => o.overrideDate >= todayManila);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Availability Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={statusRefetching || overridesRefetching} onRefresh={() => void invalidateAll()} tintColor={colors.secondary} />}
      >
        <View style={styles.toggleCard}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Available Now</Text>
            <Text style={styles.toggleDesc}>
              {isAvailable ? 'You are visible to customers and can receive job offers.' : 'You are hidden from search and will not receive new job offers.'}
            </Text>
          </View>
          <Switch
            value={isAvailable ?? false}
            onValueChange={handleToggle}
            trackColor={{ false: colors.border, true: colors.successLight }}
            thumbColor={isAvailable ? colors.success : colors.textTertiary}
            disabled={toggleMutation.isPending}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Date Overrides</Text>
          <TouchableOpacity onPress={(): void => { setShowAddForm(true); }} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>
          Block specific dates or set custom hours. Overrides take priority over your weekly schedule.
        </Text>

        {showAddForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add Override</Text>
            <TextInput
              style={styles.input}
              value={overrideDate}
              onChangeText={setOverrideDate}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={colors.textTertiary}
              maxLength={10}
            />

            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, overrideType === 'block' && styles.typeBtnActive]}
                onPress={(): void => { setOverrideType('block'); }}
              >
                <Text style={[styles.typeBtnText, overrideType === 'block' && styles.typeBtnTextActive]}>
                  Block Entire Day
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, overrideType === 'custom' && styles.typeBtnActive]}
                onPress={(): void => { setOverrideType('custom'); }}
              >
                <Text style={[styles.typeBtnText, overrideType === 'custom' && styles.typeBtnTextActive]}>
                  Custom Hours
                </Text>
              </TouchableOpacity>
            </View>

            {overrideType === 'custom' && (
              <View style={styles.timeRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="Start (HH:MM)"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={5}
                />
                <Text style={styles.timeSep}>to</Text>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="End (HH:MM)"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={5}
                />
              </View>
            )}

            <TextInput
              style={styles.input}
              value={overrideReason}
              onChangeText={setOverrideReason}
              placeholder="Reason (optional, e.g. Vacation, Family event)"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={styles.formActions}>
              <Button title="Cancel" onPress={resetForm} variant="ghost" />
              <Button
                title={isPending ? 'Saving...' : 'Save'}
                onPress={handleAddOverride}
                loading={isPending}
                disabled={isPending}
              />
            </View>
          </View>
        )}

        {futureOverrides.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}><Calendar size={48} color={colors.textSecondary} /></View>
            <Text style={styles.emptyTitle}>No Date Overrides</Text>
            <Text style={styles.emptyDesc}>
              Your weekly schedule is active. Add overrides to block specific dates or set custom hours when you need time off.
            </Text>
          </View>
        ) : (
          futureOverrides.map((o) => (
            <View key={o.id} style={styles.overrideCard}>
              <View style={styles.overrideInfo}>
                <Text style={styles.overrideDate}>{formatDateLabel(o.overrideDate)}</Text>
                {o.isAvailable && o.startTime && o.endTime ? (
                  <Text style={styles.overrideTime}>Available: {o.startTime} – {o.endTime}</Text>
                ) : (
                  <Text style={styles.overrideBlocked}>Blocked (unavailable)</Text>
                )}
                {o.reason && <Text style={styles.overrideReason}>{o.reason}</Text>}
              </View>
              <TouchableOpacity
                onPress={(): void => { handleRemoveOverride(o); }}
                style={styles.removeBtn}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity
          style={styles.scheduleLink}
          onPress={(): void => { router.push(Routes.PROVIDER.SCHEDULE); }}
        >
          <ClipboardList size={16} color={colors.primary} />
          <Text style={styles.scheduleLinkText}> Edit Weekly Schedule →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 100 },

  toggleCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  toggleInfo: { flex: 1, marginRight: spacing.base },
  toggleTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: 4 },
  toggleDesc: { ...typography.bodySmall, color: colors.textSecondary },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.base },

  addBtn: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  addBtnText: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },

  formCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  formTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  typeBtnText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  typeBtnTextActive: { color: colors.white },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeInput: { flex: 1 },
  timeSep: { ...typography.body, color: colors.textTertiary },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.sm },
  emptyIconWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  emptyTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyDesc: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.lg },

  overrideCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  overrideInfo: { flex: 1 },
  overrideDate: { ...typography.body, fontWeight: '600', color: colors.text },
  overrideTime: { ...typography.bodySmall, color: colors.success, marginTop: 2 },
  overrideBlocked: { ...typography.bodySmall, color: colors.error, marginTop: 2 },
  overrideReason: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  removeBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  removeBtnText: { fontSize: 18, color: colors.error, fontWeight: '700' },

  scheduleLink: {
    marginTop: spacing.lg,
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: 'center',
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  scheduleLinkText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
