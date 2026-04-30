import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookingStore, type BookingDraft } from '@/stores/booking.store';
import { createBooking } from '@/services/booking.service';
import { createPaymentIntent } from '@/services/payment.service';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, Wallet, ScanLine, Lock } from '@/components/icons';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

type PaymentMethod = NonNullable<BookingDraft['paymentMethod']>;

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: IconComponent;
  description: string;
}

const PAYMENT_METHODS: PaymentOption[] = [
  { id: 'gcash', label: 'GCash', icon: Smartphone, description: 'Pay with GCash e-wallet' },
  { id: 'maya', label: 'Maya', icon: Smartphone, description: 'Pay with Maya e-wallet' },
  { id: 'card', label: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard' },
  { id: 'wallet', label: 'Wallet Balance', icon: Wallet, description: 'Pay from your onService wallet' },
  { id: 'qrph', label: 'QR Ph', icon: ScanLine, description: 'Scan to pay via QR Ph' },
];

export default function CheckoutScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, serviceFee, total, addonsTotal, setPaymentMethod, reset } = useBookingStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(draft.paymentMethod);
  const [loading, setLoading] = useState(false);

  const handleMethodSelect = (method: PaymentMethod): void => {
    setSelectedMethod(method);
    setPaymentMethod(method);
  };

  const handlePay = async (): Promise<void> => {
    if (!selectedMethod) {
      Alert.alert('Payment Method', 'Please select a payment method.');
      return;
    }
    if (!draft.categoryId || !draft.subcategoryId || !draft.address || !draft.barangay || !draft.scheduledDate || !draft.scheduledTime) {
      Alert.alert('Missing Info', 'Booking details incomplete. Please go back and fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const scheduledAt = new Date(
        `${draft.scheduledDate}T${draft.scheduledTime}:00+08:00`,
      ).toISOString();

      const description = draft.description.trim().length >= 10
        ? draft.description.trim()
        : `${draft.subcategoryName ?? 'Service'} – ${draft.scheduledDate ?? ''}`.trim();

      // Phase 14 Dispatch 05 — Bug 175 + Bug 176.
      // No `servicePrice`; server resolves canonical price from the
      // subcategory's base_price. Addons sent as `{addonId, quantity}`;
      // server resolves canonical price from service_addons by id.
      const booking = await createBooking({
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId,
        bookingType: 'fixed_price',
        description,
        address: draft.address,
        barangay: draft.barangay || '',
        city: draft.city ?? '',
        province: draft.province ?? '',
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
        scheduledAt,
        addons: draft.addons.length > 0
          ? draft.addons.map((a) => ({ addonId: a.id, quantity: 1 }))
          : undefined,
      });

      const intent = await createPaymentIntent(booking.id, selectedMethod);

      reset();
      router.replace({
        pathname: '/customer/booking/confirm',
        params: { bookingId: booking.id },
      });

      if (selectedMethod !== 'wallet' && intent.checkoutUrl) {
        const canOpen = await Linking.canOpenURL(intent.checkoutUrl);
        if (canOpen) {
          await Linking.openURL(intent.checkoutUrl);
        }
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Payment Failed', msg ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Booking summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Booking Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service</Text>
            <Text style={styles.summaryValue}>{draft.subcategoryName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryValue}>
              {draft.scheduledDate ? formatDate(draft.scheduledDate) : '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Time</Text>
            <Text style={styles.summaryValue}>{draft.scheduledTime ?? '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Address</Text>
            <Text style={styles.summaryValue} numberOfLines={2}>
              {draft.address ?? '—'}
            </Text>
          </View>
        </View>

        {/* Payment methods */}
        <Text style={styles.sectionTitle}>Choose Payment Method</Text>
        {PAYMENT_METHODS.map((method) => {
          const MIcon = method.icon;
          return (
            <TouchableOpacity
              key={method.id}
              style={[styles.methodCard, selectedMethod === method.id && styles.methodSelected]}
              onPress={() => handleMethodSelect(method.id)}
              activeOpacity={0.7}
            >
              <View style={styles.methodIconWrap}><MIcon size={24} color={colors.primary} /></View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>{method.label}</Text>
                <Text style={styles.methodDesc}>{method.description}</Text>
              </View>
              <View
                style={[styles.radio, selectedMethod === method.id && styles.radioSelected]}
              >
                {selectedMethod === method.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Escrow info — Bug 834 (Phase 14 D04 SiguradoShield pull). */}
        {/* Strips the SiguradoShield™ trademark; the escrow claim is */}
        {/* verifiable on its own. Tap-to-safety affordance preserved as a */}
        {/* link to /customer/safety-and-support for users curious about */}
        {/* what "escrow" means in practice. */}
        <TouchableOpacity
          style={styles.escrowBanner}
          onPress={() => router.push(Routes.CUSTOMER.SAFETY)}
          activeOpacity={0.7}
        >
          <View style={styles.escrowIconWrap}><Lock size={22} color={colors.primary} /></View>
          <Text style={styles.escrowText}>
            Your payment is held in escrow until you confirm the job is complete. Tap to learn more about our safety affordances.
          </Text>
        </TouchableOpacity>

        {/* Price breakdown */}
        <View style={styles.priceBreakdown}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service Price</Text>
            <Text style={styles.priceValue}>{formatPHP(draft.basePrice)}</Text>
          </View>
          {addonsTotal > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Add-ons ({draft.addons.length})</Text>
              <Text style={styles.priceValue}>{formatPHP(addonsTotal)}</Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Platform Fee</Text>
            <Text style={styles.priceValue}>{formatPHP(serviceFee)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPHP(total)}</Text>
          </View>
        </View>

        {/* Legal */}
        <Text style={styles.legal}>
          By proceeding, you agree to our Terms of Service and Privacy Policy.
          All payments are processed securely by PayMongo.
        </Text>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button
          title={loading ? 'Processing...' : `Pay ${formatPHP(total)}`}
          onPress={handlePay}
          loading={loading}
          disabled={!selectedMethod || loading}
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

  summaryCard: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  summaryTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  summaryValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'right' },

  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  methodSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  methodIcon: { fontSize: 24, marginRight: spacing.md },
  methodIconWrap: { marginRight: spacing.md, width: 28, alignItems: 'center' as const },
  methodInfo: { flex: 1 },
  methodLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  methodDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },

  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  escrowIcon: { fontSize: 20, marginRight: spacing.sm },
  escrowIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  escrowText: { ...typography.bodySmall, color: colors.success, flex: 1 },

  priceBreakdown: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.base,
  },
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

  legal: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.base,
  },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
