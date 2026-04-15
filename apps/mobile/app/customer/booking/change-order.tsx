import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getChangeOrders, respondToChangeOrder, type ChangeOrder } from '@/services/booking.service';

function formatCurrency(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function ChangeOrderScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery({
    queryKey: ['changeOrders', bookingId],
    queryFn: () => getChangeOrders(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const respondMutation = useMutation({
    mutationFn: ({ orderId, approved }: { orderId: string; approved: boolean }) =>
      respondToChangeOrder(orderId, approved),
    onSuccess: (_, { approved }) => {
      void queryClient.invalidateQueries({ queryKey: ['changeOrders', bookingId] });
      Alert.alert('Success', approved
        ? 'Change order approved. Additional charges will be added to your booking.'
        : 'Change order declined. The provider will complete the original scope.',
      );
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleRespond = (order: ChangeOrder, approved: boolean) => {
    const msg = approved
      ? `Approve additional charge of ${formatCurrency(order.additionalAmount)}?`
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

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#00B4D8" />
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {(orders ?? []).length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No Change Orders</Text>
              <Text style={styles.emptyDesc}>If the provider finds additional work is needed, change orders will appear here.</Text>
            </View>
          ) : (
            orders?.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={[styles.badge, order.status === 'approved' ? styles.approvedBadge : order.status === 'declined' ? styles.declinedBadge : styles.pendingBadge]}>
                    <Text style={[styles.badgeText, order.status === 'approved' ? styles.approvedText : order.status === 'declined' ? styles.declinedText : styles.pendingText]}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.orderAmount}>{formatCurrency(order.additionalAmount)}</Text>
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
                  Submitted {new Date(order.createdAt).toLocaleDateString()}
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
                      {respondMutation.isPending ? <ActivityIndicator size="small" color="#FFF" /> : (
                        <Text style={styles.approveText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: '#1B3A4B' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1B3A4B' },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1B3A4B', marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  orderCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  approvedBadge: { backgroundColor: '#ECFDF5' },
  declinedBadge: { backgroundColor: '#FEF2F2' },
  pendingBadge: { backgroundColor: '#FFFBEB' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  approvedText: { color: '#10B981' },
  declinedText: { color: '#EF4444' },
  pendingText: { color: '#F59E0B' },
  orderAmount: { fontSize: 18, fontWeight: '800', color: '#1B3A4B' },
  orderDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 10 },
  photoRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  photoThumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  photoIcon: { fontSize: 20 },
  dateText: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  declineText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  approveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center' },
  approveText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
