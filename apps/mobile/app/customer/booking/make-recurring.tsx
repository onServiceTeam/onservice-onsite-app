import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getBookingById } from '@/services/booking.service';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Repeat } from '@/components/icons';
// A7 — shared UI kit for loading/error states + toast feedback.
import { SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';

import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
type Frequency = 'weekly' | 'bi_weekly' | 'monthly';

const FREQUENCY_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Weekly', desc: 'Same day every week' },
  { value: 'bi_weekly', label: 'Bi-weekly', desc: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly', desc: 'Once a month' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

export default function MakeRecurringScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();

  const [frequency, setFrequency] = useState<Frequency>('weekly');
  // BUG-PHASE71-04 fix — pre-fix the preferredDay defaulted to today's
  // day-of-week (new Date().getDay()), which is wrong: the user is
  // making this recurring from a SPECIFIC past booking. The natural
  // default is the day-of-week the original booking was scheduled on
  // (so a Tuesday cleaning becomes a Tuesday recurring, not "today's"
  // day). Initialised below in a useEffect that syncs the day to the
  // booking once it loads, but the user can still override.
  const [dayTouched, setDayTouched] = useState(false);
  const [preferredDay, setPreferredDay] = useState<number>(new Date().getDay());
  const [timeTouched, setTimeTouched] = useState(false);
  const [preferredTime, setPreferredTime] = useState('09:00');

  const { data: booking, isLoading, isError: bookingError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId!),
    enabled: !!bookingId,
    staleTime: 5 * 60 * 1000,
  });

  const canPreview = booking?.bookingType === 'fixed_price' && !!booking.subcategoryId;
  const pricePreviewQuery = useQuery({
    queryKey: ['recurring-price-preview', booking?.subcategoryId],
    queryFn: async () => {
      const res = await api.get<{
        data: { servicePrice: number; serviceFee: number; totalAmount: number };
      }>(`/api/v1/recurring/preview/${booking!.subcategoryId}`);
      return res.data.data;
    },
    enabled: canPreview,
    retry: false,
  });

  // BUG-PHASE71-04 fix — sync preferredDay to the original booking's
  // scheduled weekday once the booking loads. Only runs while the user
  // hasn't manually picked a different day.
  //
  // BUG-PHASE109-01 fix — pre-fix this called `.getDay()` on the Date
  // object, which returns the DEVICE-LOCAL weekday. For a booking
  // scheduled at, say, 1:30 AM Thursday Manila (= 17:30 UTC Wednesday),
  // a customer's device set to UTC-12 would interpret the timestamp as
  // 05:30 UTC-12 Wednesday, so getDay() returned 3 (Wed) instead of
  // 4 (Thu). The recurring booking then defaulted to repeating on
  // Wednesdays — the wrong day. Same Manila-tz pattern as Phase 105's
  // calendar fix. Now we extract the Manila weekday explicitly so the
  // default matches the day the customer actually booked.
  useEffect(() => {
    if (!booking?.scheduledAt || dayTouched) return;
    const manilaWeekday = new Date(booking.scheduledAt).toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      weekday: 'short',
    });
    const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(manilaWeekday);
    if (dayIndex >= 0) setPreferredDay(dayIndex);
  }, [booking?.scheduledAt, dayTouched]);

  useEffect(() => {
    if (!booking?.scheduledAt || timeTouched) return;
    const manilaTime = new Date(booking.scheduledAt).toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'Asia/Manila',
    });
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(manilaTime)) setPreferredTime(manilaTime);
  }, [booking?.scheduledAt, timeTouched]);

  // Redirect to Bookings if there's no booking to make recurring. Done in
  // an effect (not during render) so navigation isn't a render side-effect.
  // Guarded on !isLoading so we don't bounce while the query is in flight.
  useEffect(() => {
    if (!bookingId) {
      router.replace(Routes.TABS.BOOKINGS);
      return;
    }
    if (!isLoading && !bookingError && !booking) {
      router.replace(Routes.TABS.BOOKINGS);
    }
  }, [bookingId, isLoading, bookingError, booking, router]);

  const createRecurring = useMutation({
    mutationFn: async () => {
      if (!booking || !pricePreviewQuery.data) throw new Error('Recurring price is not available');
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
        preferredTime,
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
      showToast('Recurring booking created! Manage it from your Bookings tab.', 'success');
      router.replace(Routes.TABS.BOOKINGS);
    },
    onError: (err: unknown) => {
      // Phase K MED-K04 fix — canonical error helper instead of raw err.message.
      showToast(getErrorMessage(err, 'Failed to create recurring booking.'), 'error');
    },
  });

  const handleSetup = useCallback((): void => {
    createRecurring.mutate();
  }, [createRecurring]);

  const handleSkip = useCallback((): void => {
    router.replace(Routes.TABS.BOOKINGS);
  }, [router]);

  if (!bookingId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          title="Recurring setup unavailable"
          message="This link does not identify a completed booking. Open recurring setup from an eligible booking."
          onRetry={handleSkip}
        />
      </View>
    );
  }

  if (isLoading || (canPreview && pricePreviewQuery.isLoading)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (bookingError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load this booking. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          title="Recurring setup unavailable"
          message="This booking could not be verified for recurring setup. Return to your bookings and try again."
          onRetry={handleSkip}
        />
      </View>
    );
  }

  if (!canPreview) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.unavailableWorkspace}>
          <View style={styles.iconCircle}><Repeat size={28} color={colors.primary} /></View>
          <Text style={styles.title}>This service can’t repeat automatically</Text>
          <Text style={styles.subtitle}>
            Recurring schedules currently support fixed-price services. You can still book this service again from your booking history.
          </Text>
          <Button title="Back to Bookings" onPress={handleSkip} />
        </View>
      </View>
    );
  }

  if (pricePreviewQuery.isError || !pricePreviewQuery.data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message={getErrorMessage(pricePreviewQuery.error, 'We could not verify the current recurring price for this service.')}
          onRetry={() => void pricePreviewQuery.refetch()}
        />
      </View>
    );
  }

  const pricePreview = pricePreviewQuery.data;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={isPhone ? 'Make booking recurring' : 'Tablet and desktop recurring setup workspace'}
      >
      <View style={[styles.content, !isPhone && styles.contentWide]}>
        <View style={styles.iconCircle}>
          <Repeat size={28} color={colors.primary} />
        </View>

        <Text style={styles.title}>Make This Recurring?</Text>
        <Text style={styles.subtitle}>
          We’ll create each visit on your schedule. You’ll review and pay each booking before service.
        </Text>

        <View style={styles.serviceCard}>
          <View style={styles.serviceCopy}>
            <Text style={styles.serviceName}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
            <Text style={styles.servicePriceLabel}>Current scheduled total per visit</Text>
          </View>
          <Text style={styles.servicePrice}>{formatPHP(pricePreview.totalAmount)}</Text>
        </View>
        <View style={styles.priceBreakdown}>
          <Text style={styles.priceBreakdownText}>Service {formatPHP(pricePreview.servicePrice)}</Text>
          <Text style={styles.priceBreakdownText}>Fee {formatPHP(pricePreview.serviceFee)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How Often?</Text>
          <View style={[styles.optionRow, !isPhone && styles.optionRowWide]}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionChip, frequency === opt.value && styles.optionChipActive]}
                onPress={() => setFrequency(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: frequency === opt.value }}
                accessibilityLabel={opt.label}
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
                onPress={() => { setPreferredDay(idx); setDayTouched(true); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: preferredDay === idx }}
                accessibilityLabel={day}
              >
                <Text style={[styles.dayText, preferredDay === idx && styles.dayTextActive]}>{day}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preferred Time</Text>
          <View style={styles.timeGrid}>
            {[...new Set([...TIME_SLOTS, preferredTime])].sort().map((time) => (
              <TouchableOpacity
                key={time}
                style={[styles.timeChip, preferredTime === time && styles.timeChipActive]}
                onPress={() => { setPreferredTime(time); setTimeTouched(true); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: preferredTime === time }}
                accessibilityLabel={time}
              >
                <Text style={[styles.timeText, preferredTime === time && styles.timeTextActive]}>{time}</Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1, padding: spacing.base, paddingTop: spacing.xxl },
  scrollContentWide: { padding: spacing.xxl, justifyContent: 'center' },
  workspace: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  workspaceWide: { maxWidth: 960 },
  content: { alignItems: 'center' },
  contentWide: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xxl },
  unavailableWorkspace: { width: '100%', maxWidth: 600, alignSelf: 'center', alignItems: 'center', padding: spacing.xxl, marginTop: spacing.xxl },

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
  serviceCopy: { flex: 1, marginRight: spacing.md },
  serviceName: { ...typography.h3, color: colors.primary, flex: 1 },
  servicePrice: { ...typography.price, color: colors.primary },
  servicePriceLabel: { ...typography.caption, color: colors.primary, marginTop: 2 },
  priceBreakdown: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: -spacing.md, marginBottom: spacing.lg },
  priceBreakdownText: { ...typography.caption, color: colors.textSecondary },

  section: { width: '100%', marginBottom: spacing.lg },
  sectionLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },

  optionRow: { gap: spacing.sm },
  optionRowWide: { flexDirection: 'row' },
  optionChip: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dayText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  dayTextActive: { color: colors.primary, fontWeight: '600' },

  timeGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    minWidth: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  timeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  timeText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  timeTextActive: { color: colors.primary, fontWeight: '700' },

  actions: { gap: spacing.md, paddingTop: spacing.sm },
});
