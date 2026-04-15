import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById, type Booking } from '@/services/booking.service';
import { Badge, Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDateTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const ACTIVE_STATUSES = new Set([
  'matched', 'paid', 'provider_en_route', 'provider_arrived', 'in_progress',
]);
const COMPLETED_STATUSES = new Set(['completed_by_provider', 'confirmed', 'payout_ready', 'paid_out', 'resolved']);
const NEEDS_CONFIRMATION = 'completed_by_provider';

function getStatusColor(status: string): string {
  if (ACTIVE_STATUSES.has(status)) return colors.statusInProgress;
  if (COMPLETED_STATUSES.has(status)) return colors.statusCompleted;
  if (status.startsWith('cancelled')) return colors.statusCancelled;
  if (status === 'disputed') return colors.statusDisputed;
  return colors.statusPending;
}

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: booking, isLoading, error } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !booking) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Failed to load booking details.</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  const isActive = ACTIVE_STATUSES.has(booking.status);
  const needsConfirmation = booking.status === NEEDS_CONFIRMATION;
  const canViewQuotes = booking.bookingType === 'quote_based' && ['requested', 'quoted'].includes(booking.status);
  const canViewChangeOrders = ['in_progress', 'completed_by_provider', 'confirmed'].includes(booking.status);
  const canFileDispute = ['completed_by_provider', 'confirmed'].includes(booking.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Booking Details</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <Badge
            label={booking.status.replace(/_/g, ' ').toUpperCase()}
            backgroundColor={getStatusColor(booking.status)}
            size="md"
          />
          <Text style={styles.bookingId}>#{booking.id.slice(0, 8).toUpperCase()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service</Text>
          <Text style={styles.serviceName}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
          {booking.description && <Text style={styles.serviceDesc}>{booking.description}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.detailText}>{formatDateTime(booking.scheduledAt)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.detailText}>
            {[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}
          </Text>
        </View>

        {booking.providerName && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Provider</Text>
            <TouchableOpacity
              style={styles.providerRow}
              onPress={() => booking.providerId && router.push(`/customer/provider/${booking.providerId}` as never)}
            >
              <View style={styles.providerAvatar}>
                <Text style={styles.providerInitial}>
                  {booking.providerName[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <Text style={styles.providerName}>{booking.providerName}</Text>
              <Text style={styles.providerArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.receipt}>
          <Text style={styles.receiptTitle}>Receipt</Text>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Service Price</Text>
            <Text style={styles.receiptValue}>
              {formatPHP(booking.servicePrice + (booking.sukiDiscount ?? 0))}
            </Text>
          </View>
          {(booking.sukiDiscount ?? 0) > 0 && (
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: '#16a34a' }]}>Suki Discount</Text>
              <Text style={[styles.receiptValue, { color: '#16a34a' }]}>-{formatPHP(booking.sukiDiscount)}</Text>
            </View>
          )}
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Platform Fee</Text>
            <Text style={styles.receiptValue}>{formatPHP(booking.serviceFee)}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptTotalLabel}>Total</Text>
            <Text style={styles.receiptTotalValue}>{formatPHP(booking.totalAmount)}</Text>
          </View>
          {booking.paymentMethod && (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Payment Method</Text>
              <Text style={styles.receiptValue}>
                {booking.paymentMethod.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {booking.completedAt && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed</Text>
            <Text style={styles.detailText}>{formatDateTime(booking.completedAt)}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {canViewQuotes && (
          <Button
            title="View Quotes"
            onPress={() => router.push(`/customer/booking/quotes?bookingId=${id}` as never)}
          />
        )}
        {isActive && (
          <Button
            title="Track Booking"
            onPress={() => router.push(`/customer/booking/tracker?bookingId=${id}` as never)}
          />
        )}
        {needsConfirmation && (
          <Button
            title="Confirm & Review"
            onPress={() => router.push(`/customer/booking/complete?bookingId=${id}` as never)}
          />
        )}
        {canViewChangeOrders && (
          <Button
            title="View Change Orders"
            onPress={() => router.push(`/customer/booking/change-order?bookingId=${id}` as never)}
            variant="outline"
          />
        )}
        {(isActive || needsConfirmation) && booking.providerId && (
          <Button
            title="Chat with Provider"
            onPress={() => router.push(`/customer/chat/${booking.id}` as never)}
            variant="outline"
            style={styles.chatButton}
          />
        )}
        {canFileDispute && (
          <Button
            title="File a Dispute"
            onPress={() => router.push(`/customer/booking/dispute?bookingId=${id}` as never)}
            variant="ghost"
          />
        )}
        {COMPLETED_STATUSES.has(booking.status) && booking.status !== 'completed_by_provider' && (
          <View style={styles.completedActions}>
            <Button
              title="Leave a Review"
              onPress={() => router.push(`/customer/booking/review?bookingId=${id}` as never)}
              variant="outline"
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 160 },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },

  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  bookingId: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  serviceName: { ...typography.h3, color: colors.text },
  serviceDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  detailText: { ...typography.body, color: colors.text },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  providerInitial: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  providerName: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  providerArrow: { fontSize: 22, color: colors.textTertiary },

  receipt: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  receiptTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  receiptLabel: { ...typography.body, color: colors.textSecondary },
  receiptValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  receiptDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  receiptTotalLabel: { ...typography.h3, color: colors.text },
  receiptTotalValue: { ...typography.price, color: colors.primary },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  chatButton: { marginTop: 0 },
  completedActions: { gap: spacing.sm },
});
