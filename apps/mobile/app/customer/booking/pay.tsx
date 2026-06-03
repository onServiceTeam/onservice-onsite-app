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
// shows the receipt total + payment-method picker, and triggers
// `createPaymentIntent(bookingId, method)`. On wallet, the API
// debits + funds escrow synchronously and the success path replaces
// to /customer/booking/confirm. On gcash/maya/card/qrph, the
// returned `checkoutUrl` is opened via Linking and the user is
// redirected back when PayMongo completes.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { createPaymentIntent } from '@/services/payment.service';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatBookingRef } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, Wallet, ScanLine, Lock, AlertTriangle } from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

type PaymentMethod = 'gcash' | 'maya' | 'card' | 'wallet' | 'qrph';

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

export default function PayExistingBookingScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const handlePay = async (): Promise<void> => {
    if (!selectedMethod || !bookingId) {
      Alert.alert('Payment Method', 'Please select a payment method.');
      return;
    }
    setLoading(true);
    try {
      const intent = await createPaymentIntent(bookingId, selectedMethod);

      // Wallet charges synchronously server-side — safe to land on confirm.
      if (selectedMethod === 'wallet') {
        router.replace({ pathname: '/customer/booking/confirm', params: { bookingId } });
        return;
      }

      // Phase 200 — non-wallet methods must open the PayMongo checkout.
      // Only route to confirm once it actually opens; otherwise the customer
      // would see "submitted" without having paid. If it can't open, route
      // to payment-failed so they can retry.
      if (intent.checkoutUrl && (await Linking.canOpenURL(intent.checkoutUrl))) {
        router.replace({ pathname: '/customer/booking/confirm', params: { bookingId } });
        await Linking.openURL(intent.checkoutUrl);
        return;
      }

      router.replace({
        pathname: '/customer/booking/payment-failed',
        params: { bookingId, reason: 'We could not open the payment page. Your booking is saved — please retry payment.' },
      });
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Could not start payment. Please try again.');
      Alert.alert('Payment Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, padding: 24 }]}>
        <View style={{ marginBottom: 12, alignItems: 'center' as const }}><AlertTriangle size={48} color={colors.error} /></View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Could not load booking</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
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
        <Button title="Back to Booking" onPress={() => router.replace(`/customer/booking/${bookingId}`)} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Complete Payment</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
        {PAYMENT_METHODS.map((m) => {
          const MIcon = m.icon;
          const isSelected = selectedMethod === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.methodCard, isSelected && styles.methodSelected]}
              onPress={() => setSelectedMethod(m.id)}
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
            <Lock size={16} color={colors.success} />
            <Text style={styles.escrowText}>
              Your payment is held in secure escrow until the job is completed.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button
          title={loading ? 'Processing…' : `Pay ${formatPHP(booking.totalAmount)}`}
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
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalLabel: { ...typography.h3, color: colors.text },
  totalValue: { ...typography.price, color: colors.primary },

  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
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
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodIconWrap: { marginRight: spacing.md, width: 28, alignItems: 'center' as const },
  methodInfo: { flex: 1 },
  methodLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  methodDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  escrowCard: {
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  escrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  escrowText: { ...typography.caption, color: colors.success, flex: 1, lineHeight: 18 },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
