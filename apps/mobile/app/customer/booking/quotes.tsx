import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBookingQuotes, acceptQuote, declineQuote, type BookingQuote } from '@/services/booking.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, borderRadius } from '@/config/theme';

function QuoteCard({ quote, onAccept, onDecline, isPending }: {
  quote: BookingQuote;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}): React.ReactElement {
  const isExpired = new Date(quote.expiresAt) < new Date();
  const isResolved = quote.status !== 'submitted';

  return (
    <View style={[styles.quoteCard, isResolved && styles.quoteResolved]}>
      <View style={styles.quoteHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>{quote.providerName ?? 'Provider'}</Text>
          <View style={styles.providerMeta}>
            {quote.providerRating != null && (
              <Text style={styles.metaText}>★ {quote.providerRating.toFixed(1)}</Text>
            )}
            <Text style={styles.metaText}>• {quote.providerTotalJobs} jobs</Text>
          </View>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Total</Text>
          <Text style={styles.priceValue}>{formatPHP(quote.quotedPrice)}</Text>
        </View>
      </View>

      <Text style={styles.quoteDesc}>{quote.description}</Text>

      {quote.lineItems.length > 0 && (
        <View style={styles.lineItemsSection}>
          <Text style={styles.lineItemsTitle}>Breakdown</Text>
          {quote.lineItems.map((item, idx) => (
            <View key={item.id ?? idx} style={styles.lineItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineItemName}>{item.description}</Text>
                <Text style={styles.lineItemMeta}>{item.quantity} {item.unit} × {formatPHP(item.unitPrice)}</Text>
              </View>
              <Text style={styles.lineItemTotal}>{formatPHP(item.lineTotal)}</Text>
            </View>
          ))}
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Labor</Text>
            <Text style={styles.subtotalValue}>{formatPHP(quote.laborAmount)}</Text>
          </View>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Materials</Text>
            <Text style={styles.subtotalValue}>{formatPHP(quote.materialsAmount)}</Text>
          </View>
        </View>
      )}

      {quote.estimatedDays != null && (
        <View style={styles.estimateRow}>
          <Text style={styles.estimateLabel}>Estimated Duration</Text>
          <Text style={styles.estimateValue}>{quote.estimatedDays} day{quote.estimatedDays > 1 ? 's' : ''}</Text>
        </View>
      )}

      {quote.notes ? (
        <View style={styles.notesSection}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{quote.notes}</Text>
        </View>
      ) : null}

      {isExpired && quote.status === 'submitted' && (
        <View style={styles.expiredBadge}>
          <Text style={styles.expiredText}>Expired</Text>
        </View>
      )}

      {isResolved && (
        <View style={[styles.statusBadge, quote.status === 'accepted' ? styles.acceptedBadge : styles.declinedBadge]}>
          <Text style={[styles.statusText, quote.status === 'accepted' ? styles.acceptedText : styles.declinedText]}>
            {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
          </Text>
        </View>
      )}

      {!isResolved && !isExpired && (
        <View style={styles.quoteActions}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={onDecline}
            disabled={isPending}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={onAccept}
            disabled={isPending}
          >
            {isPending ? <ActivityIndicator size="small" color={colors.white} /> : (
              <Text style={styles.acceptBtnText}>Accept Quote</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function QuotesScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: quotes, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookingQuotes', bookingId],
    queryFn: () => getBookingQuotes(bookingId ?? ''),
    enabled: !!bookingId,
    refetchInterval: 30_000,
  });

  const acceptMutation = useMutation({
    mutationFn: (quoteId: string) => acceptQuote(bookingId ?? '', quoteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
      Alert.alert('Success', 'Quote accepted! Proceed to payment.', [
        { text: 'OK', onPress: () => router.replace(`/customer/booking/${bookingId}`) },
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not accept quote.';
      Alert.alert('Error', message);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (quoteId: string) => declineQuote(bookingId ?? '', quoteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
      Alert.alert('Declined', 'Quote has been declined.');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not decline quote.';
      Alert.alert('Error', message);
    },
  });

  const handleAccept = (quoteId: string): void => {
    Alert.alert('Accept Quote', 'Are you sure you want to accept this quote? Other quotes will be declined.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: () => acceptMutation.mutate(quoteId) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compare Quotes</Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.info} />
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Failed to load quotes</Text>
          <TouchableOpacity onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.quotesCount}>
            {quotes?.length ?? 0} quote{(quotes?.length ?? 0) !== 1 ? 's' : ''} received
          </Text>

          {(quotes ?? []).length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>⏳</Text>
              <Text style={styles.emptyTitle}>Waiting for Quotes</Text>
              <Text style={styles.emptyDesc}>Providers will send quotes soon. You'll be notified when new quotes arrive.</Text>
            </View>
          ) : (
            quotes?.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                onAccept={() => handleAccept(quote.id)}
                onDecline={() => declineMutation.mutate(quote.id)}
                isPending={acceptMutation.isPending || declineMutation.isPending}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.info, borderRadius: 8 },
  retryText: { color: colors.white, fontWeight: '600' },
  quotesCount: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.base },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  quoteCard: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.base, marginBottom: spacing.base, borderWidth: 1, borderColor: colors.border },
  quoteResolved: { opacity: 0.7 },
  quoteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  providerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  providerMeta: { flexDirection: 'row', gap: 6, marginTop: 2 },
  metaText: { fontSize: 12, color: colors.textSecondary },
  priceBox: { alignItems: 'flex-end' },
  priceLabel: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase' },
  priceValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  quoteDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  lineItemsSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginBottom: spacing.md },
  lineItemsTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lineItemName: { fontSize: 13, color: colors.text },
  lineItemMeta: { fontSize: 11, color: colors.textTertiary },
  lineItemTotal: { fontSize: 13, fontWeight: '600', color: colors.text },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  subtotalLabel: { fontSize: 13, color: colors.textSecondary },
  subtotalValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  estimateLabel: { fontSize: 13, color: colors.textSecondary },
  estimateValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  notesSection: { backgroundColor: colors.backgroundSecondary, borderRadius: 8, padding: 10, marginBottom: spacing.md },
  notesLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  notesText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  expiredBadge: { backgroundColor: colors.errorLight, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: 8, alignSelf: 'flex-start', marginTop: spacing.xs },
  expiredText: { fontSize: 12, fontWeight: '600', color: colors.error },
  statusBadge: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: 8, alignSelf: 'flex-start', marginTop: spacing.xs },
  acceptedBadge: { backgroundColor: colors.successLight },
  declinedBadge: { backgroundColor: colors.errorLight },
  statusText: { fontSize: 12, fontWeight: '600' },
  acceptedText: { color: colors.success },
  declinedText: { color: colors.error },
  quoteActions: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  declineBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  acceptBtn: { flex: 2, paddingVertical: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.text, alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
