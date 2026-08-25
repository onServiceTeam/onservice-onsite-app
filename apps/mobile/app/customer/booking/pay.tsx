// BUG-PHASE86-01 — pay-for-existing-booking screen.
//
// Pre-fix: when a customer accepted a quote on a quote-based booking,
// the server moved the booking to status='payment_pending'. The
// customer was then sent to /customer/booking/[id] (the booking
// detail screen), which exposed Cancel + Chat but no payment action
// for the payment_pending state. The only way to actually pay was
// to drop the booking and start over from the home screen — which
// loses the accepted quote.
//
// This screen takes a `bookingId` query param, fetches the booking,
// shows the receipt total + payment-method picker, and triggers the atomic
// wallet payment path. External methods remain visible but disabled under E14
// so a customer cannot enter the known-invalid authorization flow.

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { createPaymentIntent, getWalletBalance } from '@/services/payment.service';
import { Button, TrustStrip } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatBookingRef } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, Wallet, ScanLine, Lock, ChevronLeft } from '@/components/icons';
// A7 — shared UI kit for loading/error states + toast feedback.
import { SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

type PaymentMethod = 'gcash' | 'maya' | 'card' | 'wallet' | 'qrph';

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

export default function PayExistingBookingScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  // Wallet balance — so a customer paying from their onService wallet is told
  // up front if it's short, instead of failing server-side after tapping Pay.
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWalletBalance, staleTime: 30_000 });
  const walletBalance = walletQuery.data?.availableBalance ?? 0;
  const total = booking?.totalAmount ?? 0;
  const walletSelected = selectedMethod === 'wallet';
  const walletShort = walletSelected && walletQuery.isSuccess && walletBalance < total;
  const walletUnavailable = walletSelected && walletQuery.isError;
  const walletChecking = walletSelected && walletQuery.isPending;

  const handlePay = async (): Promise<void> => {
    if (!selectedMethod || !bookingId) {
      showToast('Please select a payment method.', 'warning');
      return;
    }
    if (selectedMethod !== 'wallet') {
      showToast('That payment method is temporarily unavailable.', 'warning');
      return;
    }
    if (!walletQuery.isSuccess) {
      showToast('We could not verify your wallet balance. Please wait a moment and try again.', 'warning');
      return;
    }
    if (selectedMethod === 'wallet' && walletBalance < total) {
      showToast(`Your wallet balance (${formatPHP(walletBalance)}) is below the total. External payments and wallet top-ups are temporarily unavailable.`, 'warning');
      return;
    }
    setLoading(true);
    try {
      await createPaymentIntent(bookingId, selectedMethod);
      router.replace({ pathname: Routes.CUSTOMER.BOOKING_CONFIRM, params: { bookingId } });
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Could not start payment. Please try again.');
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load this booking. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (booking.status !== 'payment_pending') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, padding: 24 }]}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8, textAlign: 'center' }}>
          This booking is not awaiting payment.
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
          Current status: {booking.status}
        </Text>
        <Button title="Back to Booking" onPress={() => router.replace(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId! }))} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back from payment" onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Complete Payment</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Complete booking payment' : 'Desktop booking payment workspace'}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Booking #{formatBookingRef(booking.id, booking.createdAt)}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service</Text>
            <Text style={styles.summaryValue}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
          </View>
          {booking.providerName && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Provider</Text>
              <Text style={styles.summaryValue}>{booking.providerName}</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service Price</Text>
            {/* servicePrice already has the suki discount removed; show the
                gross here so the "Suki Discount" line below doesn't subtract it
                a second time (the lines now reconcile to the Total). */}
            <Text style={styles.summaryValue}>{formatPHP(booking.servicePrice + (booking.sukiDiscount ?? 0))}</Text>
          </View>
          {(booking.sukiDiscount ?? 0) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.success }]}>Suki Discount</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>-{formatPHP(booking.sukiDiscount)}</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Fee</Text>
            <Text style={styles.summaryValue}>{formatPHP(booking.serviceFee)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPHP(booking.totalAmount)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose Payment Method</Text>
        <View style={styles.paymentHoldNotice} accessibilityRole="alert">
          <Text style={styles.paymentHoldTitle}>External payments temporarily unavailable</Text>
          <Text style={styles.paymentHoldText}>
            Card, GCash, Maya, and QR Ph are paused while we correct the payment authorization flow. No external payment will be created. You can still use an existing wallet balance.
          </Text>
        </View>
        {PAYMENT_METHODS.map((m) => {
          const MIcon = m.icon;
          const isSelected = selectedMethod === m.id;
          return (
              <TouchableOpacity
                key={m.id}
                accessibilityRole="radio"
                accessibilityLabel={`${m.label}, ${m.available ? 'available' : 'unavailable'}`}
                style={[styles.methodCard, isSelected && styles.methodSelected, !m.available && styles.methodUnavailable]}
              onPress={() => setSelectedMethod(m.id)}
              disabled={!m.available}
              accessibilityState={{ disabled: !m.available, selected: isSelected }}
              activeOpacity={0.7}
            >
              <View style={styles.methodIconWrap}><MIcon size={24} color={colors.primary} /></View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>{m.label}</Text>
                <Text style={styles.methodDesc}>{m.description}</Text>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.escrowCard}>
          <View style={styles.escrowRow}>
            <Lock size={16} color={colors.primary} />
            <Text style={styles.escrowText}>
              After this wallet payment succeeds, the booking shows its paid and escrow status. Release follows customer confirmation or the platform completion timer.
            </Text>
          </View>
        </View>

        <TrustStrip style={styles.trustStrip} />
      </ScrollView>

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
            title={loading ? 'Processing…' : `Pay ${formatPHP(booking.totalAmount)}`}
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
  centered: { justifyContent: 'center', alignItems: 'center' },
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalLabel: { ...typography.h3, color: colors.text },
  totalValue: { ...typography.price, color: colors.primary },

  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
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
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodUnavailable: { opacity: 0.55 },
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
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  escrowCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  escrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  escrowText: { ...typography.caption, color: colors.primary, flex: 1, lineHeight: 18 },

  trustStrip: { marginTop: spacing.md },

  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  bottomBarInner: { width: '100%' },
  bottomBarInnerWide: { maxWidth: 760, alignSelf: 'center' },
  walletShortHint: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
