import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookingStore, type BookingDraft } from '@/stores/booking.store';
import { createBooking } from '@/services/booking.service';
import { createPaymentIntent, getWalletBalance } from '@/services/payment.service';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, TrustStrip } from '@/components/ui';
// B2 — inline validation feedback (toast for screen-level, inline for field).
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, Wallet, ScanLine, Lock, Check } from '@/components/icons';

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
  // B2 — inline field error for the payment-method picker (was a modal alert).
  const [methodError, setMethodError] = useState<string | null>(null);
  // Phase 200 — know the wallet balance so we can stop a wallet payment that
  // would fail server-side (insufficient funds) and point the customer to
  // top up, instead of creating the booking and then hitting a raw error.
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWalletBalance, staleTime: 30_000 });
  const walletBalance = walletQuery.data?.availableBalance ?? 0;
  const walletShort = selectedMethod === 'wallet' && walletBalance < total;
  // Phase 200 — dedupe protection: once the booking is created, remember its
  // id so a retry after a payment-intent failure re-uses it instead of
  // creating a second booking. Cleared once we successfully navigate away.
  const createdBookingIdRef = useRef<string | null>(null);

  const handleMethodSelect = (method: PaymentMethod): void => {
    setSelectedMethod(method);
    setPaymentMethod(method);
    // B2 — clear the inline error as soon as the user picks a method.
    setMethodError(null);
  };

  const handlePay = async (): Promise<void> => {
    if (!selectedMethod) {
      // B2 — inline error on the payment section instead of a modal alert.
      setMethodError('Please select a payment method to continue.');
      return;
    }
    if (!draft.categoryId || !draft.subcategoryId || !draft.address || !draft.barangay || !draft.scheduledDate || !draft.scheduledTime) {
      // The missing fields live on earlier steps (nothing to highlight on this
      // screen), so a single summary toast is the right affordance here.
      showToast('Booking details are incomplete. Please go back and complete all fields.', 'error');
      return;
    }
    if (selectedMethod === 'wallet' && walletBalance < total) {
      Alert.alert(
        'Insufficient wallet balance',
        'Your wallet balance is lower than the total. Top up your wallet or choose another payment method.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Top Up', onPress: () => router.push(Routes.CUSTOMER.WALLET) },
        ],
      );
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
      //
      // Phase 200 — only create the booking once. If a previous attempt
      // created the booking but the payment intent failed, re-use the same
      // booking id on retry so we never create a duplicate.
      let bookingId = createdBookingIdRef.current;
      if (!bookingId) {
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
          // D27 Phase 4b — hourly bookings authorize estimatedHours x rate.
          estimatedHours: draft.isHourly ? draft.estimatedHours : undefined,
        });
        bookingId = booking.id;
        createdBookingIdRef.current = bookingId;
      }

      const intent = await createPaymentIntent(bookingId, selectedMethod);

      // Wallet charges synchronously server-side (atomic debit + escrow
      // hold), so the booking is paid by the time we land on confirm.
      if (selectedMethod === 'wallet') {
        reset();
        createdBookingIdRef.current = null;
        router.replace({ pathname: '/customer/booking/confirm', params: { bookingId } });
        return;
      }

      // Phase 200 — non-wallet methods MUST open the PayMongo checkout. Only
      // route to the success/confirm screen once the checkout actually opens;
      // otherwise the customer would land on a "submitted" screen having paid
      // nothing. If we can't open it, send them to payment-failed (the
      // booking exists and is recoverable from there).
      if (intent.checkoutUrl && (await Linking.canOpenURL(intent.checkoutUrl))) {
        reset();
        createdBookingIdRef.current = null;
        router.replace({ pathname: '/customer/booking/confirm', params: { bookingId } });
        await Linking.openURL(intent.checkoutUrl);
        return;
      }

      reset();
      createdBookingIdRef.current = null;
      router.replace({
        pathname: '/customer/booking/payment-failed',
        params: { bookingId, reason: 'We could not open the payment page. Your booking is saved — please retry payment.' },
      });
    } catch (err: unknown) {
      // Phase D CRIT-69 / K-MED-K04 fix — canonical error helper.
      // Note: createdBookingIdRef is intentionally NOT cleared here, so a
      // retry re-uses the already-created booking instead of duplicating it.
      const msg = getErrorMessage(err, 'Something went wrong. Please try again.');
      Alert.alert('Payment Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
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
        <Card style={styles.summaryCard}>
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
        </Card>

        {/* Payment methods */}
        <Text style={[styles.sectionTitle, methodError ? styles.sectionTitleError : null]}>
          Choose Payment Method
        </Text>
        {methodError ? (
          <Text
            style={styles.fieldError}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {methodError}
          </Text>
        ) : null}
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
        <Card style={styles.priceBreakdown}>
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
            <Text style={styles.priceLabel}>Platform fee</Text>
            {serviceFee > 0 ? (
              <Text style={styles.priceValue}>{formatPHP(serviceFee)}</Text>
            ) : (
              <Text style={styles.priceFree}>Free</Text>
            )}
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPHP(total)}</Text>
          </View>
        </Card>

        {/* Customer benefits (Ken, 2026-06-28): no app-usage fees; the price you
            see is the price you pay. Suki points + the escrow + ₱10,000 service
            guarantee are surfaced so the value is clear at the pay screen. */}
        <View style={styles.benefitsCard}>
          {[
            'No platform fees — you only pay for the service',
            'Held in escrow, released only when you confirm the job',
            'Eligible jobs backed by our Service Guarantee, up to ₱10,000 (subject to terms)',
            'Earn Suki points on this booking',
          ].map((benefit) => (
            <View key={benefit} style={styles.benefitLine}>
              <Check size={16} color={colors.success} />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        <TrustStrip style={styles.trustStrip} />

        {/* Legal — BUG-PHASE63-01 fix: pre-fix Terms/Privacy were plain
            text on the screen where the user is about to PAY. Now both
            documents are tappable links pushing to /customer/terms with
            the right tab pre-selected. */}
        <Text style={styles.legal}>
          By proceeding, you agree to our{' '}
          <Text
            style={styles.legalLink}
            onPress={() => router.push({ pathname: '/customer/terms', params: { tab: 'terms' } })}
            testID="checkout-terms-link"
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            onPress={() => router.push({ pathname: '/customer/terms', params: { tab: 'privacy' } })}
            testID="checkout-privacy-link"
          >
            Privacy Policy
          </Text>
          . All payments are processed securely by PayMongo.
        </Text>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {walletShort && (
          <Text style={styles.walletShortHint}>
            Wallet balance ({formatPHP(walletBalance)}) is below the total. Top up or pick another method.
          </Text>
        )}
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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
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
  // B2 — inline payment-method validation error.
  sectionTitleError: { color: colors.error },
  fieldError: {
    ...typography.bodySmall,
    color: colors.error,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
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
    backgroundColor: colors.primaryLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  escrowIcon: { fontSize: 20, marginRight: spacing.sm },
  escrowIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  escrowText: { ...typography.bodySmall, color: colors.primary, flex: 1 },

  priceBreakdown: {
    marginBottom: spacing.base,
  },
  trustStrip: {
    marginBottom: spacing.lg,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceLabel: { ...typography.body, color: colors.textSecondary },
  priceValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  priceFree: { ...typography.body, color: colors.success, fontWeight: '700' },
  benefitsCard: {
    backgroundColor: colors.successLight ?? '#E8F5EC',
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    gap: 6,
  },
  benefitLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitText: { ...typography.bodySmall, color: colors.text, lineHeight: 20, flex: 1 },
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
  legalLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  walletShortHint: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
