import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBookingQuotes, acceptQuote, declineQuote, type BookingQuote } from '@/services/booking.service';

function formatCurrency(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function QuoteCard({ quote, onAccept, onDecline, isPending }: {
  quote: BookingQuote;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}) {
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
          <Text style={styles.priceValue}>{formatCurrency(quote.quotedPrice)}</Text>
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
                <Text style={styles.lineItemMeta}>{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}</Text>
              </View>
              <Text style={styles.lineItemTotal}>{formatCurrency(item.lineTotal)}</Text>
            </View>
          ))}
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Labor</Text>
            <Text style={styles.subtotalValue}>{formatCurrency(quote.laborAmount)}</Text>
          </View>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Materials</Text>
            <Text style={styles.subtotalValue}>{formatCurrency(quote.materialsAmount)}</Text>
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
            {isPending ? <ActivityIndicator size="small" color="#FFF" /> : (
              <Text style={styles.acceptBtnText}>Accept Quote</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function QuotesScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
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
        { text: 'OK', onPress: () => router.replace(`/customer/booking/${bookingId}` as never) },
      ]);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const declineMutation = useMutation({
    mutationFn: (quoteId: string) => declineQuote(bookingId ?? '', quoteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleAccept = (quoteId: string) => {
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
          <ActivityIndicator size="large" color="#00B4D8" />
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: '#1B3A4B' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1B3A4B' },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: '#64748B', marginBottom: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#00B4D8', borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
  quotesCount: { fontSize: 14, color: '#64748B', marginBottom: 16 },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1B3A4B', marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  quoteCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  quoteResolved: { opacity: 0.7 },
  quoteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  providerName: { fontSize: 16, fontWeight: '700', color: '#1B3A4B' },
  providerMeta: { flexDirection: 'row', gap: 6, marginTop: 2 },
  metaText: { fontSize: 12, color: '#64748B' },
  priceBox: { alignItems: 'flex-end' },
  priceLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase' },
  priceValue: { fontSize: 20, fontWeight: '800', color: '#1B3A4B' },
  quoteDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 12 },
  lineItemsSection: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12, marginBottom: 12 },
  lineItemsTitle: { fontSize: 13, fontWeight: '700', color: '#1B3A4B', marginBottom: 8 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lineItemName: { fontSize: 13, color: '#1B3A4B' },
  lineItemMeta: { fontSize: 11, color: '#94A3B8' },
  lineItemTotal: { fontSize: 13, fontWeight: '600', color: '#1B3A4B' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  subtotalLabel: { fontSize: 13, color: '#64748B' },
  subtotalValue: { fontSize: 13, fontWeight: '600', color: '#1B3A4B' },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  estimateLabel: { fontSize: 13, color: '#64748B' },
  estimateValue: { fontSize: 13, fontWeight: '600', color: '#1B3A4B' },
  notesSection: { backgroundColor: '#F1F5F9', borderRadius: 8, padding: 10, marginBottom: 12 },
  notesLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 4 },
  notesText: { fontSize: 13, color: '#475569', lineHeight: 18 },
  expiredBadge: { backgroundColor: '#FEF2F2', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 },
  expiredText: { fontSize: 12, fontWeight: '600', color: '#EF4444' },
  statusBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 },
  acceptedBadge: { backgroundColor: '#ECFDF5' },
  declinedBadge: { backgroundColor: '#FEF2F2' },
  statusText: { fontSize: 12, fontWeight: '600' },
  acceptedText: { color: '#10B981' },
  declinedText: { color: '#EF4444' },
  quoteActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  declineBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  acceptBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1B3A4B', alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
