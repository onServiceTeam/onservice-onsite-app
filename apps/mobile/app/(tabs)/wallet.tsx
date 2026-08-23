import React, { useCallback, type ComponentType } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getWalletBalance } from '@/services/payment.service';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { formatDateTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';
// Phase 14 R5-complete — FilterChips for transaction-type filter.
import FilterChips from '@/components/FilterChips';
import {
  CreditCard,
  Lock,
  Unlock,
  BarChart3,
  Banknote,
  Undo2,
  Building2,
  ClipboardList,
  Shield,
  Repeat,
} from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

interface Transaction {
  id: string;
  walletId: string;
  bookingId: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId: string | null;
  createdAt: string;
}

const TRANSACTION_ICONS: Record<string, IconComponent> = {
  payment: CreditCard,
  escrow_hold: Lock,
  escrow_release: Unlock,
  commission: BarChart3,
  payout: Banknote,
  refund: Undo2,
  withdrawal: Building2,
  service_fee: ClipboardList,
  guarantee_contribution: Shield,
};

export default function WalletScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDesktop } = useResponsive();
  // Phase 14 R5-complete — FilterChips for transaction-type filter.
  const [txFilter, setTxFilter] = React.useState<string>('all');

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  const transactionsQuery = useQuery({
    queryKey: ['walletTransactions'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: Transaction[];
        pagination: { total: number };
      }>('/api/v1/wallet/transactions', { params: { page: 1, pageSize: 20 } });
      return res.data.data;
    },
    staleTime: 60 * 1000,
  });

  const isRefreshing = walletQuery.isRefetching || transactionsQuery.isRefetching;
  const isError = walletQuery.isError || transactionsQuery.isError;
  const onRefresh = useCallback(() => {
    void walletQuery.refetch();
    void transactionsQuery.refetch();
  }, [walletQuery, transactionsQuery]);

  const wallet = walletQuery.data;
  const allTransactions = transactionsQuery.data ?? [];
  // BUG-PHASE53-02 fix — pre-fix the FilterChips set `txFilter` but
  // the transactions array was rendered as-is. Filter chips were
  // dead — clicking them did nothing visible. Phase 14 R5 wired
  // the component but missed the actual filter application. Now:
  // client-side filter on the type column. (The API doesn't accept
  // a `type` filter param yet; client-side filter works on the
  // first 20-row page.)
  const transactions = React.useMemo(() => {
    if (txFilter === 'all') return allTransactions;
    if (txFilter === 'topup') {
      return allTransactions.filter(
        (t) =>
          t.type === 'topup' ||
          t.type === 'wallet_topup' ||
          (t.description ?? '').toLowerCase().includes('top-up'),
      );
    }
    if (txFilter === 'payment') {
      return allTransactions.filter((t) => t.type === 'payment' || t.type === 'escrow_hold');
    }
    if (txFilter === 'refund') {
      return allTransactions.filter((t) => t.type === 'refund');
    }
    return allTransactions;
  }, [allTransactions, txFilter]);

  const renderBalanceCard = (): React.ReactElement => (
    <View style={[styles.balanceCard, isDesktop && styles.desktopBalanceCard]}>
      {walletQuery.isLoading ? (
        <ActivityIndicator size="large" color={colors.white} />
      ) : (
        <>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            {wallet ? formatPHP(wallet.availableBalance) : formatPHP(0)}
          </Text>
          {wallet && wallet.pendingBalance > 0 && (
            <Text style={styles.pendingText}>{formatPHP(wallet.pendingBalance)} pending</Text>
          )}
          <TouchableOpacity
            style={styles.topUpBtn}
            onPress={() => router.push(Routes.CUSTOMER.WALLET)}
          >
            <Text style={styles.topUpBtnText}>+ Top Up</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const renderTransaction = ({ item }: { item: Transaction }): React.ReactElement => {
    const Icon = TRANSACTION_ICONS[item.type] ?? Repeat;
    return (
      <View style={styles.txRow}>
        <View style={styles.txIconWrap}>
          <Icon size={22} color={colors.primary} />
        </View>
        <View style={styles.txInfo}>
          <Text style={styles.txDescription} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.txDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <Text style={[styles.txAmount, item.amount >= 0 ? styles.txCredit : styles.txDebit]}>
          {item.amount >= 0 ? '+' : '-'}
          {formatPHP(Math.abs(item.amount))}
        </Text>
      </View>
    );
  };

  const renderTransactionList = (includeBalance: boolean): React.ReactElement => (
    <FlatList
      data={transactions}
      renderItem={renderTransaction}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={() => (
        <View>
          {includeBalance && renderBalanceCard()}
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        transactionsQuery.isLoading ? (
          <View style={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (
          <EmptyState
            icon={<CreditCard size={48} color={colors.textTertiary} />}
            title={
              allTransactions.length === 0
                ? 'No transactions yet'
                : `No ${txFilter === 'topup' ? 'top-ups' : txFilter === 'payment' ? 'payments' : txFilter === 'refund' ? 'refunds' : 'transactions'} in this view`
            }
            description={
              allTransactions.length === 0
                ? 'Top up your wallet or pay for a booking to see history here.'
                : undefined
            }
          />
        )
      }
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
      <Text style={styles.title}>Wallet</Text>

      {/* Phase 14 R5-complete — FilterChips for transaction-type filter */}
      <FilterChips
        options={[
          { value: 'all', label: 'All' },
          { value: 'topup', label: 'Top-ups' },
          { value: 'payment', label: 'Payments' },
          { value: 'refund', label: 'Refunds' },
        ]}
        selected={txFilter}
        onSelect={setTxFilter}
      />

      {isError ? (
        <ErrorState
          message="We couldn't load your wallet. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : isDesktop ? (
        <View style={styles.desktopColumns}>
          <View style={styles.desktopSummary}>{renderBalanceCard()}</View>
          <View style={styles.desktopTransactions}>{renderTransactionList(false)}</View>
        </View>
      ) : (
        renderTransactionList(true)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.base },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },

  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  desktopColumns: { flex: 1, flexDirection: 'row', gap: spacing.lg, minHeight: 0 },
  desktopSummary: { width: 360 },
  desktopTransactions: { flex: 1, minWidth: 0 },
  desktopBalanceCard: { alignItems: 'flex-start' },
  balanceLabel: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginBottom: spacing.sm },
  balanceAmount: { fontSize: 36, fontWeight: '800', color: colors.white, lineHeight: 44 },
  pendingText: { ...typography.bodySmall, color: 'rgba(255,255,255,0.6)', marginTop: spacing.sm },
  topUpBtn: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  topUpBtnText: { ...typography.body, fontWeight: '700', color: colors.white },

  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },

  list: { paddingBottom: 100 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  txIcon: { fontSize: 24, marginRight: spacing.md },
  txIconWrap: {
    marginRight: spacing.md,
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  txInfo: { flex: 1 },
  txDescription: { ...typography.body, color: colors.text },
  txDate: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  txAmount: { ...typography.body, fontWeight: '700' },
  txCredit: { color: colors.success },
  txDebit: { color: colors.text },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.textSecondary },
  // BUG-PHASE177-01 fix — helper text under the wallet empty state.
  emptyHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
