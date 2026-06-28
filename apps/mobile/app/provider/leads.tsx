// D27 Phase 1 — provider "Job Requests / Leads" inbox.
//
// Lists the open custom-quote requests this provider can quote (matched by
// category + service area, not yet quoted, no accepted quote yet) from
// GET /api/v1/providers/me/job-requests. Tapping a lead opens the job, where
// the provider builds a quote. Before this screen, custom-quote requests never
// reached a provider at all.
import React, { useCallback } from 'react';
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
import { EmptyState, ErrorState, SkeletonCard, Badge } from '@/components/ui';
import { ChevronLeft } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';

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

function budgetLabel(lead: JobRequestLead): string | null {
  if (lead.budgetMin != null && lead.budgetMax != null) {
    return `${formatPHP(lead.budgetMin)} - ${formatPHP(lead.budgetMax)}`;
  }
  if (lead.budgetMin != null) return `From ${formatPHP(lead.budgetMin)}`;
  if (lead.budgetMax != null) return `Up to ${formatPHP(lead.budgetMax)}`;
  return null;
}

export default function ProviderLeadsScreen(): React.ReactElement {
  const router = useRouter();
  const q = useQuery({ queryKey: ['provider-leads'], queryFn: fetchLeads, staleTime: 30 * 1000 });

  const renderItem = useCallback(
    ({ item }: { item: JobRequestLead }) => {
      const budget = budgetLabel(item);
      const location = [item.barangay, item.city].filter(Boolean).join(', ');
      const media = item.jobPhotos.length + (item.jobVideoUrl ? 1 : 0);
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push(`/provider/job/${item.id}`)}
        >
          <View style={styles.cardTop}>
            <Text style={styles.category}>{item.categoryName}</Text>
            <Text style={styles.time}>{formatRelative(item.createdAt)}</Text>
          </View>
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          <View style={styles.metaRow}>
            {item.urgency ? <Badge label={URGENCY_LABEL[item.urgency] ?? item.urgency} backgroundColor={colors.warning} /> : null}
            {budget ? <Text style={styles.budget}>{budget}</Text> : null}
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.location} numberOfLines={1}>
              {location || 'Location shared after you quote'}
              {item.distanceKm != null ? ` · ${item.distanceKm} km away` : ''}
            </Text>
            {media > 0 ? <Text style={styles.media}>{media} photo{media > 1 ? 's' : ''}/video</Text> : null}
          </View>
          <Text style={styles.cta}>Send a quote ›</Text>
        </TouchableOpacity>
      );
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Job Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      {q.isLoading ? (
        <View style={styles.body}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : q.isError ? (
        <View style={styles.body}>
          <ErrorState message={getErrorMessage(q.error, 'Could not load job requests.')} onRetry={() => q.refetch()} />
        </View>
      ) : (
        <FlatList
          data={q.data?.requests ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListHeaderComponent={
            (q.data?.total ?? 0) > 0 ? (
              <Text style={styles.count}>{q.data?.total} open request{(q.data?.total ?? 0) > 1 ? 's' : ''} in your area</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="📭"
              title="No open job requests"
              description="When a customer requests a custom quote in your service area, it will show up here. Make sure your services and service area are set so you get matched."
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
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text },
  body: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  count: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { ...typography.body, fontWeight: '600', color: colors.text },
  time: { ...typography.caption, color: colors.textTertiary },
  description: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  budget: { ...typography.body, fontWeight: '700', color: colors.primary },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  location: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  media: { ...typography.caption, color: colors.textTertiary },
  cta: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
});
