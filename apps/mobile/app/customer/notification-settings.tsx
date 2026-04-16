import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

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
  { key: 'promotions', label: 'Promotions & Offers', desc: 'Special deals, discounts, seasonal offers' },
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
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
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
      Alert.alert('Saved', 'Your notification preferences have been updated.');
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Failed to save preferences.');
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notification Settings</Text>
        <Text style={styles.subtitle}>
          Choose which notifications you want to receive
        </Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={enableAll}>
          <Text style={styles.quickBtnText}>Enable All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={disableOptional}>
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
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        ))}
      </View>

      {dirty && (
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
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.xxl, paddingBottom: spacing.base },
  backBtn: { marginBottom: spacing.sm },
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
    backgroundColor: colors.white,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },

  section: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderRadius: borderRadius.lg,
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
