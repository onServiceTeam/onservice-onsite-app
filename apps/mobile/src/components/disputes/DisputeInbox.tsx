import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyDisputes, type DisputeRecord } from '@/services/booking.service';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui';
import { Scale, ChevronLeft, ChevronRight } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { formatDateTime, formatBookingRef } from '@/utils/date';
import { formatPHP } from '@/utils/currency';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

type DisputeRole = 'customer' | 'provider';

const TYPE_LABELS: Record<DisputeRecord['type'], string> = {
  no_show: 'Provider did not arrive',
  incomplete: 'Incomplete work',
  substandard: 'Work quality',
  damage: 'Property damage',
  theft: 'Missing item or theft',
  overcharge: 'Charge dispute',
  other: 'Other issue',
};

const STATUS_LABELS: Record<DisputeRecord['status'], string> = {
  open: 'Waiting for provider',
  under_review: 'Under review',
  escalated: 'Escalated review',
  resolved: 'Resolved',
};

function caseRoute(role: DisputeRole, id: string): string {
  return buildRoute(
    role === 'customer' ? Routes.CUSTOMER.DISPUTE_DETAIL : Routes.PROVIDER.DISPUTE_DETAIL,
    { id },
  );
}

function DisputeCard({ dispute, role, wide }: { dispute: DisputeRecord; role: DisputeRole; wide: boolean }): React.ReactElement {
  const router = useRouter();
  const counterparty = role === 'customer' ? dispute.providerName : dispute.customerName;
  const hasOffer = dispute.status === 'open' && dispute.providerRespondedAt && dispute.refundAmount > 0;

  return (
    <TouchableOpacity
      style={[styles.card, wide && styles.cardWide]}
      onPress={() => router.push(caseRoute(role, dispute.id))}
      accessibilityRole="button"
      accessibilityLabel={`Open dispute ${dispute.id}`}
      activeOpacity={0.72}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusPill, dispute.status === 'resolved'
          ? styles.statusResolved
          : dispute.status === 'escalated'
          ? styles.statusEscalated
          : dispute.status === 'under_review'
          ? styles.statusReview
          : styles.statusOpen]}>
          <Text style={styles.statusText}>{STATUS_LABELS[dispute.status]}</Text>
        </View>
        <Text style={styles.caseRef}>Case {dispute.id.slice(0, 8).toUpperCase()}</Text>
      </View>
      <Text style={styles.cardTitle}>{TYPE_LABELS[dispute.type]}</Text>
      <Text style={styles.counterparty} numberOfLines={1}>
        {role === 'customer' ? 'Provider' : 'Customer'}: {counterparty || 'Booking participant'}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Booking {formatBookingRef(dispute.bookingId, dispute.createdAt)}</Text>
        <Text style={styles.metaText}>{formatDateTime(dispute.createdAt)}</Text>
      </View>
      {hasOffer ? (
        <View style={styles.offerBanner}>
          <Text style={styles.offerText}>Partial refund offer: {formatPHP(dispute.refundAmount)}</Text>
        </View>
      ) : null}
      <View style={styles.openRow}>
        <Text style={styles.openText}>View case</Text>
        <ChevronRight size={18} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

export default function DisputeInbox({ role }: { role: DisputeRole }): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();

  const query = useInfiniteQuery({
    queryKey: ['myDisputes', role],
    queryFn: ({ pageParam }) => getMyDisputes(pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });

  const disputes = query.data?.pages.flatMap((page) => page.disputes) ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Disputes</Text>
          <Text style={styles.headerSubtitle}>Evidence, responses, and decisions</Text>
        </View>
      </View>

      {query.isLoading ? (
        <View style={[styles.content, !isPhone && styles.contentWide]}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : query.isError ? (
        <ErrorState
          message="We couldn't load your dispute cases. Please check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, !isPhone && styles.contentWide]}
          refreshControl={(
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.primary}
            />
          )}
        >
          <View
            style={[styles.intro, !isPhone && styles.introWide]}
            accessibilityLabel={!isPhone ? `Wide ${role} dispute inbox` : undefined}
          >
            <Scale size={28} color={colors.primary} />
            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>Case record</Text>
              <Text style={styles.introText}>
                Keep evidence and responses inside onService. Support can review the same booking record from the admin case workspace.
              </Text>
            </View>
          </View>

          {disputes.length === 0 ? (
            <EmptyState
              icon={<Scale size={48} color={colors.textTertiary} />}
              title="No dispute cases"
              description={role === 'customer'
                ? 'If you file a dispute from an eligible completed booking, its progress will appear here.'
                : 'If a customer disputes one of your completed jobs, the case and response action will appear here.'}
            />
          ) : (
            <View style={[styles.grid, !isPhone && styles.gridWide]}>
              {disputes.map((dispute) => (
                <DisputeCard key={dispute.id} dispute={dispute} role={role} wide={!isPhone} />
              ))}
            </View>
          )}

          {query.hasNextPage ? (
            <TouchableOpacity
              style={styles.loadMore}
              onPress={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              <Text style={styles.loadMoreText}>{query.isFetchingNextPage ? 'Loading…' : 'Load earlier cases'}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  backButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', marginRight: spacing.sm },
  headerCopy: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: 80 },
  contentWide: { width: '100%', maxWidth: 1080, alignSelf: 'center', padding: spacing.xl },
  intro: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.primary,
    padding: spacing.base, marginBottom: spacing.lg,
  },
  introWide: { padding: spacing.lg },
  introCopy: { flex: 1 },
  introTitle: { ...typography.h3, color: colors.primaryDark, marginBottom: spacing.xs },
  introText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  grid: { gap: spacing.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.base,
  },
  cardWide: { flexGrow: 1, flexBasis: 420, minWidth: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusPill: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  statusOpen: { backgroundColor: colors.warningLight },
  statusReview: { backgroundColor: colors.primaryLight },
  statusEscalated: { backgroundColor: colors.errorLight },
  statusResolved: { backgroundColor: colors.successLight },
  statusText: { ...typography.caption, color: colors.text, fontWeight: '700' },
  caseRef: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  cardTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md },
  counterparty: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  metaRow: { marginTop: spacing.md, gap: 3 },
  metaText: { ...typography.caption, color: colors.textTertiary },
  offerBanner: { backgroundColor: colors.successLight, borderRadius: borderRadius.md, padding: spacing.sm, marginTop: spacing.md },
  offerText: { ...typography.bodySmall, color: colors.success, fontWeight: '700' },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.md },
  openText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  loadMore: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  loadMoreText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
});
