import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getChangeOrders, respondToChangeOrder, payChangeOrder,
  type ChangeOrder, type ChangeOrderResponse,
} from '@/services/booking.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ClipboardList } from '@/components/icons';

const PAYMENT_METHOD = { id: 'wallet', label: 'Wallet Balance', icon: '👛' } as const;

export default function ChangeOrderScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingPayment, setPendingPayment] = useState<ChangeOrderResponse | null>(null);
  const { data: orders, isLoading, isError, refetch } = useQuery({
    queryKey: ['changeOrders', bookingId],
    queryFn: () => getChangeOrders(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const respondMutation = useMutation({
    mutationFn: ({ orderId, approved }: { orderId: string; approved: boolean }) =>
      respondToChangeOrder(orderId, approved),
    onSuccess: (result, { approved }) => {
      void queryClient.invalidateQueries({ queryKey: ['changeOrders', bookingId] });
      if (approved && result.paymentRequired) {
        setPendingPayment(result);
      } else if (!approved) {
        Alert.alert('Declined', 'Change order declined. The provider will complete the original scope.');
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not process change order.';
      Alert.alert('Error', message);
    },
  });

  const payMutation = useMutation({
    mutationFn: () => payChangeOrder(pendingPayment!.id, 'wallet'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['changeOrders', bookingId] });
      setPendingPayment(null);
      Alert.alert('Payment Complete', 'Additional payment processed. The provider has been notified to proceed.');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not process additional payment.';
      Alert.alert('Payment Failed', message);
    },
  });

  const handleRespond = (order: ChangeOrder, approved: boolean): void => {
    const msg = approved
      ? `Approve additional charge of ${formatPHP(order.additionalAmount)}? You will be prompted to pay the additional amount.`
      : 'Decline this change order? The provider will proceed with the original scope.';
    Alert.alert(approved ? 'Approve Change Order' : 'Decline Change Order', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: approved ? 'Approve' : 'Decline', onPress: () => respondMutation.mutate({ orderId: order.id, approved }) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Orders</Text>
        <View style={styles.placeholder} />
      </View>

      {pendingPayment ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Additional Payment Required</Text>
            <Text style={styles.paymentDesc}>
              Your change order has been approved. Please pay the additional amount to proceed.
            </Text>

            <View style={styles.paymentBreakdown}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Additional Work</Text>
                <Text style={styles.paymentValue}>{formatPHP(pendingPayment.additionalAmount ?? 0)}</Text>
              </View>
              {pendingPayment.additionalServiceFee != null && (
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Service Fee</Text>
                  <Text style={styles.paymentValue}>{formatPHP(pendingPayment.additionalServiceFee)}</Text>
                </View>
              )}
              {pendingPayment.additionalTotal != null ? (
                <View style={[styles.paymentRow, styles.paymentTotalRow]}>
                  <Text style={styles.paymentTotalLabel}>Total</Text>
                  <Text style={styles.paymentTotalValue}>{formatPHP(pendingPayment.additionalTotal)}</Text>
                </View>
              ) : (
                <View style={[styles.paymentRow, styles.paymentTotalRow]}>
                  <Text style={[styles.paymentLabel, { fontStyle: 'italic' }]}>Service fee calculated at checkout</Text>
                </View>
              )}
            </View>

            <Text style={styles.payMethodLabel}>Payment Method</Text>
            <View style={[styles.payMethodOption, styles.payMethodSelected]}>
              <Text style={styles.payMethodIcon}>{PAYMENT_METHOD.icon}</Text>
              <Text style={[styles.payMethodText, styles.payMethodTextSelected]}>{PAYMENT_METHOD.label}</Text>
              <Text style={styles.payMethodCheck}>✓</Text>
            </View>
            <Text style={styles.walletNote}>
              Additional charges are paid from your wallet balance. Top up your wallet in your profile if needed.
            </Text>
          </View>

          <View style={styles.paymentFooter}>
            {payMutation.isPending ? (
              <View style={styles.paymentLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.paymentLoadingText}>Processing payment...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.payNowBtn} onPress={() => payMutation.mutate()}>
                  <Text style={styles.payNowText}>
                    {pendingPayment.additionalTotal != null
                      ? `Pay ${formatPHP(pendingPayment.additionalTotal)}`
                      : 'Pay from Wallet'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.payLaterBtn} onPress={() => setPendingPayment(null)}>
                  <Text style={styles.payLaterText}>Pay Later</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      ) : isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>Failed to load</Text>
          <Text style={[styles.emptyDesc, { marginBottom: spacing.base }]}>Something went wrong. Please try again.</Text>
          <TouchableOpacity style={styles.approveBtn} onPress={() => void refetch()}>
            <Text style={styles.approveText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {(orders ?? []).length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyEmojiWrap}><ClipboardList size={48} color={colors.textTertiary} /></View>
              <Text style={styles.emptyTitle}>No Change Orders</Text>
              <Text style={styles.emptyDesc}>If the provider finds additional work is needed, change orders will appear here.</Text>
            </View>
          ) : (
            orders?.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={[
                    styles.badge,
                    order.status === 'paid' ? styles.approvedBadge
                      : order.status === 'approved' ? styles.approvedBadge
                      : order.status === 'declined' ? styles.declinedBadge
                      : styles.pendingBadge,
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      order.status === 'paid' ? styles.approvedText
                        : order.status === 'approved' ? styles.approvedText
                        : order.status === 'declined' ? styles.declinedText
                        : styles.pendingText,
                    ]}>
                      {order.status === 'paid' ? 'Paid' : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.orderAmount}>{formatPHP(order.additionalAmount)}</Text>
                </View>

                <Text style={styles.orderDesc}>{order.description}</Text>

                {order.photos.length > 0 && (
                  <View style={styles.photoRow}>
                    {order.photos.map((_, i) => (
                      <View key={i} style={styles.photoThumb}>
                        <Text style={styles.photoIcon}>📷</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.dateText}>
                  Submitted {new Date(order.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>

                {order.status === 'pending' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => handleRespond(order, false)}
                      disabled={respondMutation.isPending}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleRespond(order, true)}
                      disabled={respondMutation.isPending}
                    >
                      {respondMutation.isPending ? <ActivityIndicator size="small" color={colors.backgroundSecondary} /> : (
                        <Text style={styles.approveText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {order.status === 'approved' && (
                  <TouchableOpacity
                    style={styles.payPendingBtn}
                    onPress={() => setPendingPayment({
                      id: order.id,
                      status: 'approved',
                      bookingId: order.bookingId,
                      paymentRequired: true,
                      additionalAmount: order.additionalAmount,
                    })}
                  >
                    <Text style={styles.payPendingText}>Pay Additional Amount</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyEmojiWrap: { marginBottom: spacing.md, alignItems: 'center' as const },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  emptyDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  orderCard: { backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  badge: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
  approvedBadge: { backgroundColor: colors.successLight },
  declinedBadge: { backgroundColor: colors.errorLight },
  pendingBadge: { backgroundColor: colors.warningLight },
  badgeText: { ...typography.caption, fontWeight: '600' },
  approvedText: { color: colors.success },
  declinedText: { color: colors.error },
  pendingText: { color: colors.warning },
  orderAmount: { fontSize: 18, fontWeight: '800', color: colors.text },
  orderDesc: { ...typography.body, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  photoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  photoThumb: { width: 60, height: 60, borderRadius: borderRadius.md, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  photoIcon: { fontSize: 20 },
  dateText: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  declineBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  declineText: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
  approveBtn: { flex: 2, paddingVertical: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.success, alignItems: 'center' },
  approveText: { ...typography.body, fontWeight: '700', color: colors.white },
  paymentCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  paymentTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  paymentDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  paymentBreakdown: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  paymentLabel: { ...typography.body, color: colors.textSecondary },
  paymentValue: { ...typography.body, color: colors.text, fontWeight: '600' },
  paymentTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: 0,
  },
  paymentTotalLabel: { ...typography.body, fontWeight: '700', color: colors.text },
  paymentTotalValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
  payMethodLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  payMethodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  payMethodSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  payMethodIcon: { fontSize: 20, marginRight: spacing.md },
  payMethodText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  payMethodTextSelected: { color: colors.primary, fontWeight: '600' },
  payMethodCheck: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  paymentFooter: { paddingTop: spacing.md },
  payNowBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  payNowText: { ...typography.body, fontWeight: '700', color: colors.white },
  payLaterBtn: { alignItems: 'center', paddingVertical: spacing.md },
  payLaterText: { ...typography.body, color: colors.textTertiary },
  paymentLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  paymentLoadingText: { ...typography.body, color: colors.primary },
  walletNote: { ...typography.caption, color: colors.textTertiary, lineHeight: 18, marginTop: spacing.xs },
  payPendingBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  payPendingText: { ...typography.body, fontWeight: '700', color: colors.white },
});
