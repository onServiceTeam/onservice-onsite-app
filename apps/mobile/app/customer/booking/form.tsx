import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookingStore } from '@/stores/booking.store';
import { Button, Input } from '@/components/ui';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, ChevronRight, MapPin } from '@/components/icons';

import { Routes } from '@/config/navigation';
const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
];

const TIMEZONE = 'Asia/Manila';

function generateDates(): { label: string; value: string }[] {
  const dates: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push({
      label: d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TIMEZONE }),
      value: d.toLocaleDateString('en-CA', { timeZone: TIMEZONE }),
    });
  }
  return dates;
}

export default function BookingFormScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, serviceFee, total, addonsTotal, setSchedule, setDescription } = useBookingStore();

  const [selectedDate, setSelectedDate] = useState<string | null>(draft.scheduledDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(draft.scheduledTime);
  const [notes, setNotes] = useState(draft.description);

  const dates = generateDates();

  const handleDateSelect = (date: string): void => {
    setSelectedDate(date);
    if (selectedTime) setSchedule(date, selectedTime);
  };

  const handleTimeSelect = (time: string): void => {
    setSelectedTime(time);
    if (selectedDate) setSchedule(selectedDate, time);
  };

  const handleProceed = (): void => {
    if (!selectedDate || !selectedTime) {
      showToast('Please select both a date and time for your booking.', 'warning');
      return;
    }
    if (!draft.address) {
      showToast('Please select your service address.', 'warning');
      return;
    }
    setSchedule(selectedDate, selectedTime);
    setDescription(notes);
    router.push(Routes.CUSTOMER.CHECKOUT);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Book Service</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Service summary */}
        <View style={styles.serviceSummary}>
          <Text style={styles.serviceName}>{draft.subcategoryName ?? 'Service'}</Text>
          <Text style={styles.servicePrice}>{formatPHP(draft.basePrice)}</Text>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Address</Text>
          <TouchableOpacity
            style={styles.addressButton}
            onPress={() => router.push(Routes.CUSTOMER.ADDRESS_PICKER)}
          >
            <MapPin size={18} color={colors.primary} style={styles.addressIcon} />
            <Text style={[styles.addressText, !draft.address && styles.addressPlaceholder]}>
              {draft.address
                ? [draft.address, draft.barangay, draft.city].filter(Boolean).join(', ')
                : 'Tap to select your address'}
            </Text>
            <ChevronRight size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Date picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.datePicker}
          >
            {dates.map((d) => (
              <TouchableOpacity
                key={d.value}
                style={[styles.dateChip, selectedDate === d.value && styles.dateChipSelected]}
                onPress={() => handleDateSelect(d.value)}
              >
                <Text
                  style={[styles.dateLabel, selectedDate === d.value && styles.dateLabelSelected]}
                >
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Time picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Time</Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.timeChip, selectedTime === t && styles.timeChipSelected]}
                onPress={() => handleTimeSelect(t)}
              >
                <Text
                  style={[styles.timeLabel, selectedTime === t && styles.timeLabelSelected]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes */}
        {/* BUG-PHASE146-01 fix — pre-fix this input had no maxLength
            cap. The server's createBookingSchema enforces
            description.max(2000) (booking.validators.ts:23). A customer
            typing > 2000 chars would pass form, hit checkout, hit
            server, get a generic 400. Same fix shape as Phase 145
            (review comment + privateNote). */}
        <View style={styles.section}>
          <Input
            label="Additional Notes (optional)"
            placeholder="Describe any special requirements..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            maxLength={2000}
            style={styles.notesInput}
          />
        </View>

        {/* Price breakdown */}
        <View style={styles.priceBreakdown}>
          <Text style={styles.priceTitle}>Price Breakdown</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service Price</Text>
            <Text style={styles.priceValue}>{formatPHP(draft.basePrice)}</Text>
          </View>
          {draft.addons.map((a) => (
            <View key={a.id} style={styles.priceRow}>
              <Text style={styles.priceLabel}>{a.name}</Text>
              <Text style={styles.priceValue}>+{formatPHP(a.price)}</Text>
            </View>
          ))}
          {addonsTotal > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Add-ons Subtotal</Text>
              <Text style={styles.priceValue}>{formatPHP(addonsTotal)}</Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Platform Service Fee</Text>
            <Text style={styles.priceValue}>{formatPHP(serviceFee)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPHP(total)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button
          title={`Proceed to Payment • ${formatPHP(total)}`}
          onPress={handleProceed}
          disabled={!selectedDate || !selectedTime || !draft.address}
        />
      </View>
    </View>
  );
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
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 120 },

  serviceSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  serviceName: { ...typography.h3, color: colors.primary, flex: 1 },
  servicePrice: { ...typography.price, color: colors.primary },

  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  addressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.md,
  },
  addressIcon: { fontSize: 18, marginRight: spacing.sm },
  addressText: { ...typography.body, color: colors.text, flex: 1 },
  addressPlaceholder: { color: colors.textTertiary },
  addressArrow: { fontSize: 22, color: colors.textTertiary },

  datePicker: { gap: spacing.sm, paddingRight: spacing.base },
  dateChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dateChipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dateLabel: { ...typography.bodySmall, color: colors.textSecondary },
  dateLabelSelected: { color: colors.primary, fontWeight: '600' },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  timeChipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  timeLabel: { ...typography.bodySmall, color: colors.textSecondary },
  timeLabelSelected: { color: colors.primary, fontWeight: '600' },

  notesInput: { height: 80, textAlignVertical: 'top' },

  priceBreakdown: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
  },
  priceTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceLabel: { ...typography.body, color: colors.textSecondary },
  priceValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  totalLabel: { ...typography.h3, color: colors.text },
  totalValue: { ...typography.price, color: colors.primary },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
