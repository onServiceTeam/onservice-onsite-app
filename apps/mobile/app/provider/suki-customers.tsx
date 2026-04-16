import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getProviderSukiCustomers, type SukiCustomer } from '@/services/suki.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const TIER_DISPLAY: Record<string, { label: string; emoji: string; color: string }> = {
  new: { label: 'New', emoji: '🌱', color: colors.textSecondary },
  regular: { label: 'Regular', emoji: '⭐', color: colors.textSecondary },
  suki: { label: 'Suki', emoji: '🌟', color: colors.warning },
  super_suki: { label: 'Super Suki', emoji: '💎', color: colors.error },
};

function CustomerCard({ customer }: { customer: SukiCustomer }): React.ReactElement {
  const tierInfo = TIER_DISPLAY[customer.tier] ?? TIER_DISPLAY.new!;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {customer.customerName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.customerName}>{customer.customerName}</Text>
          <View style={styles.tierRow}>
            <Text style={styles.tierEmoji}>{tierInfo.emoji}</Text>
            <Text style={[styles.tierLabel, { color: tierInfo.color }]}>{tierInfo.label}</Text>
          </View>
        </View>
        {customer.discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{customer.discount}% off</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{customer.totalBookings}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPHP(customer.totalSpent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        {customer.lastBookingAt && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {new Date(customer.lastBookingAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
            </Text>
            <Text style={styles.statLabel}>Last Booking</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function ProviderSukiCustomersScreen(): React.ReactElement {
  const router = useRouter();

  const { data: customers, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['providerSukiCustomers'],
    queryFn: getProviderSukiCustomers,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Suki Customers</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>Failed to load customers</Text>
          <TouchableOpacity onPress={() => void refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={customers ?? []}
          renderItem={({ item }) => <CustomerCard customer={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.secondary}
              colors={[colors.secondary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.heroSection}>
              <Text style={styles.heroEmoji}>🤝</Text>
              <Text style={styles.heroTitle}>Your Repeat Customers</Text>
              <Text style={styles.heroDesc}>
                Customers who book you multiple times build Suki loyalty and earn discounts.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No Suki Customers Yet</Text>
              <Text style={styles.emptyDesc}>
                As customers rebook your services, they will appear here with their loyalty tier and stats.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  headerPlaceholder: { width: 30 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorEmoji: { fontSize: 48, marginBottom: spacing.md },
  errorText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  retryButton: { marginTop: spacing.sm },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
  listContent: { padding: spacing.base, paddingBottom: 40 },
  heroSection: { alignItems: 'center', marginBottom: spacing.lg },
  heroEmoji: { fontSize: 48, marginBottom: spacing.sm },
  heroTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  heroDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  customerName: { ...typography.body, fontWeight: '700', color: colors.text },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tierEmoji: { fontSize: 12 },
  tierLabel: { ...typography.caption, fontWeight: '600' },
  discountBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  discountText: { ...typography.caption, fontWeight: '700', color: colors.success },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.body, fontWeight: '700', color: colors.text },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  emptyDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
});
