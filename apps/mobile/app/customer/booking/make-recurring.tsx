import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getBookingById } from '@/services/booking.service';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle } from '@/components/icons';

import { Routes } from '@/config/navigation';
type Frequency = 'weekly' | 'bi_weekly' | 'monthly';

const FREQUENCY_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Weekly', desc: 'Same day every week' },
  { value: 'bi_weekly', label: 'Bi-weekly', desc: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly', desc: 'Once a month' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MakeRecurringScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [preferredDay, setPreferredDay] = useState<number>(new Date().getDay());

  const { data: booking, isLoading, isError: bookingError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId!),
    enabled: !!bookingId,
    staleTime: 5 * 60 * 1000,
  });

  const createRecurring = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error('Booking data not available');
      const schedTime = booking.scheduledAt
        ? new Date(booking.scheduledAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' })
        : '09:00';
      // Phase 14 Dispatch 05 — Bug 208.
      // No `servicePrice` field; the server resolves the canonical
      // price from service_subcategories.base_price for the
      // referenced subcategoryId.
      await api.post('/api/v1/recurring', {
        categoryId: booking.categoryId,
        subcategoryId: booking.subcategoryId,
        providerId: booking.providerId,
        originalBookingId: booking.id,
        frequency,
        preferredDay,
        preferredTime: schedTime,
        address: booking.address ?? '',
        barangay: booking.barangay ?? '',
        city: booking.city ?? '',
        province: booking.province ?? '',
        latitude: booking.latitude,
        longitude: booking.longitude,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      Alert.alert(
        'Recurring Booking Created!',
        'We\'ll automatically schedule this service for you. You can manage it from your Bookings tab.',
        [{ text: 'Great!', onPress: (): void => { router.replace(Routes.TABS.BOOKINGS); } }],
      );
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Failed to create recurring booking.');
    },
  });

  const handleSetup = useCallback((): void => {
    createRecurring.mutate();
  }, [createRecurring]);

  const handleSkip = useCallback((): void => {
    router.replace(Routes.TABS.BOOKINGS);
  }, [router]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (bookingError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, padding: 24 }]}>
        <View style={{ marginBottom: 12, alignItems: 'center' as const }}><AlertTriangle size={48} color={colors.error} /></View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load booking details. Please try again.</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!bookingId || !booking) {
    router.replace(Routes.TABS.BOOKINGS);
    return <View />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.base }]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>🔄</Text>
        </View>

        <Text style={styles.title}>Make This Recurring?</Text>
        <Text style={styles.subtitle}>
          Loved this service? Set it to repeat automatically so you never have to rebook.
        </Text>

        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
          <Text style={styles.servicePrice}>{formatPHP(booking.totalAmount)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How Often?</Text>
          <View style={styles.optionRow}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionChip, frequency === opt.value && styles.optionChipActive]}
                onPress={() => setFrequency(opt.value)}
              >
                <Text style={[styles.optionLabel, frequency === opt.value && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.optionDesc, frequency === opt.value && styles.optionDescActive]}>
                  {opt.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preferred Day</Text>
          <View style={styles.dayRow}>
            {DAY_NAMES.map((day, idx) => (
              <TouchableOpacity
                key={day}
                style={[styles.dayChip, preferredDay === idx && styles.dayChipActive]}
                onPress={() => setPreferredDay(idx)}
              >
                <Text style={[styles.dayText, preferredDay === idx && styles.dayTextActive]}>{day}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          title={createRecurring.isPending ? 'Setting up...' : `Set Up ${FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.label} Booking`}
          onPress={handleSetup}
          loading={createRecurring.isPending}
          disabled={createRecurring.isPending}
        />
        <Button
          title="No Thanks"
          onPress={handleSkip}
          variant="ghost"
          disabled={createRecurring.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.base },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center' },

  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 40 },

  title: { ...typography.h2, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },

  serviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    width: '100%',
    marginBottom: spacing.lg,
  },
  serviceName: { ...typography.h3, color: colors.primary, flex: 1 },
  servicePrice: { ...typography.price, color: colors.primary },

  section: { width: '100%', marginBottom: spacing.lg },
  sectionLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },

  optionRow: { gap: spacing.sm },
  optionChip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  optionChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  optionLabelActive: { color: colors.primary },
  optionDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  optionDescActive: { color: colors.primary },

  dayRow: { flexDirection: 'row', gap: spacing.xs },
  dayChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dayText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  dayTextActive: { color: colors.primary, fontWeight: '600' },

  actions: { gap: spacing.md },
});
