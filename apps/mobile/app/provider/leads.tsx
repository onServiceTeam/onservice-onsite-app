// D27 Phase 1 — provider "Job Requests / Leads" inbox.
//
// Lists the open custom-quote requests this provider can quote (matched by
// category + service area, not yet quoted, no accepted quote yet) from
// GET /api/v1/providers/me/job-requests. Tapping a lead opens the job, where
// the provider builds a quote. Before this screen, custom-quote requests never
// reached a provider at all.
import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { EmptyState, ErrorState, SkeletonCard, Badge, LazyImage } from '@/components/ui';
import { ChevronLeft, Inbox } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { formatJobRequestBudget } from '@/utils/jobRequestBudget';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { getSocket } from '@/services/socket.service';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';

interface JobRequestLead {
  id: string;
  categoryName: string;
  description: string;
  urgency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  jobPhotos: string[];
  jobVideoUrl: string | null;
  barangay: string | null;
  city: string | null;
  distanceKm: number | null;
  createdAt: string;
}

const URGENCY_LABEL: Record<string, string> = {
  same_day: 'Same day',
  within_3_days: 'Within 3 days',
  within_a_week: 'Within a week',
  flexible: 'Flexible',
};

async function fetchLeads(): Promise<{ requests: JobRequestLead[]; total: number }> {
  const res = await api.get<{ success: boolean; requests: JobRequestLead[]; total: number }>(
    '/api/v1/providers/me/job-requests',
    { params: { pageSize: 50 } },
  );
  return { requests: res.data.requests ?? [], total: res.data.total ?? 0 };
}

// D38 human audit: lead cards show the customer's photos (the first few as
// thumbnails, the rest counted) and always state the budget, including
// "Customer is not sure of the price" when none was given.
const CARD_THUMBNAILS = 3;

export default function ProviderLeadsScreen(): React.ReactElement {
  const router = useRouter();
  const q = useQuery({ queryKey: ['provider-leads'], queryFn: fetchLeads, staleTime: 30 * 1000 });

  // Live refresh: the server emits 'new:job_request' to matched providers when a
  // new custom-quote request lands. While the Leads screen is open, refetch so a
  // new lead appears without a manual pull-to-refresh. (refetch is referentially
  // stable in react-query, so this subscribes once.)
  const refetch = q.refetch;
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (): void => { void refetch(); };
    socket.on('new:job_request', handler);
    return () => { socket.off('new:job_request', handler); };
  }, [refetch]);

  // Reflow the leads into 2 columns on tablet/desktop.
  const { breakpoint, isPhone } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderItem = useCallback(
    ({ item }: { item: JobRequestLead }) => {
      const budget = formatJobRequestBudget(item.budgetMin, item.budgetMax);
      const hasBudget = item.budgetMin != null || item.budgetMax != null;
      const location = [item.barangay, item.city].filter(Boolean).join(', ');
      const photos = item.jobPhotos ?? [];
      const shownPhotos = photos.slice(0, CARD_THUMBNAILS);
      const morePhotos = photos.length - shownPhotos.length;
      return (
        <TouchableOpacity
          style={[styles.card, numColumns > 1 && styles.cardGrid]}
          activeOpacity={0.7}
          onPress={() => router.push(`/provider/job/${item.id}/quote`)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.categoryName} job request and prepare a quote`}
        >
          <View style={styles.cardTop}>
            <Text style={styles.category}>{item.categoryName}</Text>
            <Text style={styles.time}>{formatRelative(item.createdAt)}</Text>
          </View>
          {item.description ? (
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {shownPhotos.length > 0 ? (
            <View style={styles.thumbRow} accessibilityLabel={`${photos.length} customer photo${photos.length === 1 ? '' : 's'}`}>
              {shownPhotos.map((uri, index) => (
                <LazyImage
                  key={uri}
                  source={uri}
                  containerStyle={styles.thumb}
                  accessibilityLabel={`Customer photo ${index + 1} of ${photos.length}`}
                />
              ))}
              {morePhotos > 0 ? (
                <View style={[styles.thumb, styles.thumbMore]}>
                  <Text style={styles.thumbMoreText}>+{morePhotos}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.metaRow}>
            {item.urgency ? <Badge label={URGENCY_LABEL[item.urgency] ?? item.urgency} backgroundColor={colors.warning} /> : null}
            <Text style={hasBudget ? styles.budget : styles.budgetUnsure}>{budget}</Text>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.location} numberOfLines={1}>
              {location || 'Location shared after you quote'}
              {item.distanceKm != null ? ` · ${item.distanceKm} km away` : ''}
            </Text>
            {item.jobVideoUrl ? <Text style={styles.media}>Includes a video</Text> : null}
          </View>
          <Text style={styles.cta}>Send a quote ›</Text>
        </TouchableOpacity>
      );
    },
    [router, numColumns],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to provider dashboard"
          >
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Job Requests</Text>
          <View style={{ width: 44 }} />
        </View>
      </View>

      {q.isLoading ? (
        <View style={[styles.body, !isPhone && styles.bodyWide]}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : q.isError ? (
        <View style={[styles.body, !isPhone && styles.bodyWide]}>
          <ErrorState message={getErrorMessage(q.error, 'Could not load job requests.')} onRetry={() => q.refetch()} />
        </View>
      ) : (
        <FlatList
          data={q.data?.requests ?? []}
          key={`leads-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}
          accessibilityLabel={numColumns > 1 ? 'Tablet and desktop provider job request grid' : 'Provider job request list'}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListHeaderComponent={
            (q.data?.total ?? 0) > 0 ? (
              <View style={styles.requestSummary}>
                <Text style={styles.count}>{q.data?.total} open request{(q.data?.total ?? 0) > 1 ? 's' : ''} in your area</Text>
                <Text style={styles.summaryText}>A request stays open to eligible providers until a customer accepts a quote or the request closes.</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Inbox size={48} color={colors.textTertiary} />}
              title="No open job requests"
              description="When a customer in your service area describes a job you offer, it will show up here with their photos and budget. Make sure your services and service area are set so you get matched."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: { width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  body: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  bodyWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.xl },
  requestSummary: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.sm },
  count: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  summaryText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  // Tablet/desktop: 2-up grid.
  gridRow: { gap: spacing.sm },
  cardGrid: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { ...typography.body, fontWeight: '600', color: colors.text },
  time: { ...typography.caption, color: colors.textTertiary },
  description: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  budget: { ...typography.body, fontWeight: '700', color: colors.primary },
  budgetUnsure: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  thumbRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: borderRadius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  thumbMore: { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  thumbMoreText: { ...typography.bodySmall, fontWeight: '700', color: colors.textSecondary },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  location: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  media: { ...typography.caption, color: colors.textTertiary },
  cta: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
});
