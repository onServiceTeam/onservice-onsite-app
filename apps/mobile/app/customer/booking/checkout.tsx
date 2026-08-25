import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
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
import { useResponsive } from '@/hooks/useResponsive';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

type PaymentMethod = NonNullable<BookingDraft['paymentMethod']>;

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: IconComponent;
  description: string;
  available: boolean;
}

const PAYMENT_METHODS: PaymentOption[] = [
  { id: 'gcash', label: 'GCash', icon: Smartphone, description: 'Temporarily unavailable', available: false },
  { id: 'maya', label: 'Maya', icon: Smartphone, description: 'Temporarily unavailable', available: false },
  { id: 'card', label: 'Credit/Debit Card', icon: CreditCard, description: 'Temporarily unavailable', available: false },
  { id: 'wallet', label: 'Wallet Balance', icon: Wallet, description: 'Pay from your existing onService balance', available: true },
  { id: 'qrph', label: 'QR Ph', icon: ScanLine, description: 'Temporarily unavailable', available: false },
];

export default function CheckoutScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { draft, serviceFee, total, addonsTotal, setPaymentMethod, reset } = useBookingStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    draft.paymentMethod === 'wallet' ? 'wallet' : null,
  );
  const [loading, setLoading] = useState(false);
  // B2 — inline field error for the payment-method picker (was a modal alert).
  const [methodError, setMethodError] = useState<string | null>(null);
  // Know the wallet balance so we can stop a wallet payment that would fail
  // server-side before creating the booking.
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWalletBalance, staleTime: 30_000 });
  const walletBalance = walletQuery.data?.availableBalance ?? 0;
  const walletSelected = selectedMethod === 'wallet';
  const walletShort = walletSelected && walletQuery.isSuccess && walletBalance < total;
  const walletUnavailable = walletSelected && walletQuery.isError;
  const walletChecking = walletSelected && walletQuery.isPending;
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
    if (!draft.categoryId || !draft.subcategoryId || !draft.address || !draft.barangay || draft.latitude == null || draft.longitude == null || !draft.scheduledDate || !draft.scheduledTime) {
      // The missing fields live on earlier steps (nothing to highlight on this
      // screen), so a single summary toast is the right affordance here.
      showToast('Booking details are incomplete. Please go back and complete all fields.', 'error');
      return;
    }
    if (selectedMethod === 'wallet' && !walletQuery.isSuccess) {
      showToast('We could not verify your wallet balance. Please wait a moment and try again.', 'warning');
      return;
    }
    if (selectedMethod === 'wallet' && walletBalance < total) {
      showToast('Your wallet balance is lower than the total, and external payments and wallet top-ups are temporarily unavailable. No booking or payment was created.', 'warning');
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
          latitude: draft.latitude,
          longitude: draft.longitude,
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
        router.replace({ pathname: Routes.CUSTOMER.BOOKING_CONFIRM, params: { bookingId } });
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
        router.replace({ pathname: Routes.CUSTOMER.BOOKING_CONFIRM, params: { bookingId } });
        await Linking.openURL(intent.checkoutUrl);
        return;
      }

      reset();
      createdBookingIdRef.current = null;
      router.replace({
        pathname: Routes.CUSTOMER.BOOKING_PAYMENT_FAILED,
        params: { bookingId, reason: 'We could not open the payment page. Your booking is saved — please retry payment.' },
      });
    } catch (err: unknown) {
      // Phase D CRIT-69 / K-MED-K04 fix — canonical error helper.
      // Note: createdBookingIdRef is intentionally NOT cleared here, so a
      // retry re-uses the already-created booking instead of duplicating it.
      const msg = getErrorMessage(err, 'Something went wrong. Please try again.');
      showToast(msg, 'error');
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
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Booking checkout' : 'Desktop booking checkout workspace'}
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
        <View style={styles.paymentHoldNotice} accessibilityRole="alert">
          <Text style={styles.paymentHoldTitle}>External payments temporarily unavailable</Text>
          <Text style={styles.paymentHoldText}>
            Card, GCash, Maya, and QR Ph are paused while we correct the payment authorization flow. No external payment will be created. You can still use an existing wallet balance.
          </Text>
        </View>
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
                accessibilityRole="radio"
                accessibilityLabel={`${method.label}, ${method.available ? 'available' : 'unavailable'}`}
                style={[
                styles.methodCard,
                selectedMethod === method.id && styles.methodSelected,
                !method.available && styles.methodUnavailable,
              ]}
              onPress={() => handleMethodSelect(method.id)}
              disabled={!method.available}
              accessibilityState={{ disabled: !method.available, selected: selectedMethod === method.id }}
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
            accessibilityRole="button"
            accessibilityLabel="Open payment safety and support information"
          >
          <View style={styles.escrowIconWrap}><Lock size={22} color={colors.primary} /></View>
          <Text style={styles.escrowText}>
            After a wallet payment succeeds, your booking shows its paid and escrow status. Release follows customer confirmation or the platform completion timer. Tap for details.
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

        {/* Checkout facts only. The deferred insurance/guarantee product must
            not be advertised here, and E18 means release cannot be described
            as customer-confirmation-only. */}
        <View style={styles.benefitsCard}>
          {[
            'The itemized total above is the amount this wallet payment will charge',
            'Server-verified payment and escrow status stays visible in your booking',
            'Dispute filing and evidence review start from the booking record',
            'Eligible completed bookings earn Suki points',
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
            onPress={() => router.push({ pathname: Routes.CUSTOMER.TERMS, params: { tab: 'terms' } })}
            testID="checkout-terms-link"
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            onPress={() => router.push({ pathname: Routes.CUSTOMER.TERMS, params: { tab: 'privacy' } })}
            testID="checkout-privacy-link"
          >
            Privacy Policy
          </Text>
          . Existing wallet payments are processed within onService. External PayMongo payment methods are currently unavailable.
        </Text>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <View style={[styles.bottomBarInner, !isPhone && styles.bottomBarInnerWide]}>
          {walletShort && (
            <Text style={styles.walletShortHint}>
              Wallet balance ({formatPHP(walletBalance)}) is below the total. External payments and wallet top-ups are temporarily unavailable.
            </Text>
          )}
          {walletChecking ? <Text style={styles.walletShortHint}>Checking your wallet balance…</Text> : null}
          {walletUnavailable ? (
            <Text style={styles.walletShortHint}>We could not verify your wallet balance. Please try again.</Text>
          ) : null}
          <Button
            title={loading ? 'Processing...' : `Pay ${formatPHP(total)}`}
            onPress={handlePay}
            loading={loading}
            disabled={!selectedMethod || loading || walletShort || walletChecking || walletUnavailable}
          />
        </View>
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
  scrollContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.xl },

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
  methodUnavailable: { opacity: 0.55 },
  methodIcon: { fontSize: 24, marginRight: spacing.md },
  methodIconWrap: { marginRight: spacing.md, width: 28, alignItems: 'center' as const },
  methodInfo: { flex: 1 },
  methodLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  methodDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  paymentHoldNotice: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  paymentHoldTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  paymentHoldText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
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
  bottomBarInner: { width: '100%' },
  bottomBarInnerWide: { maxWidth: 760, alignSelf: 'center' },
  walletShortHint: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
