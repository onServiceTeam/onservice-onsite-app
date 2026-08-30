import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, ChevronRight, MessageSquare, Plus } from '@/components/icons';
import { EmptyState } from '@/components/ui';
import { Routes, buildRoute } from '@/config/navigation';
import {
  listMyTickets,
  SUPPORT_TYPE_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportTicket,
  type SupportTicketStatus,
} from '@/services/support.service';
import { useResponsive } from '@/hooks/useResponsive';

// Colour cue for the ticket status chip. Open/active = info, waiting-on-you =
// warning, resolved/closed = muted, escalated = danger.
function statusColor(status: SupportTicketStatus): { bg: string; fg: string } {
  switch (status) {
    case 'resolved':
    case 'closed':
      return { bg: colors.surfaceMuted, fg: colors.textSecondary };
    case 'waiting_on_customer':
      return { bg: colors.warningLight, fg: colors.warningDark };
    case 'escalated':
      return { bg: colors.errorLight, fg: colors.error };
    default:
      return { bg: colors.infoLight, fg: colors.infoDark };
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SupportInboxScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();

  const ticketsQuery = useQuery({
    queryKey: ['support', 'mine'],
    queryFn: listMyTickets,
    staleTime: 30_000,
  });

  const tickets = ticketsQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Support</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Support requests' : 'Desktop support requests workspace'}
      >
        <Text style={styles.subtitle}>
          Message our support team and keep the whole conversation here, so we can help fast and back you up if anything goes wrong with a booking.
        </Text>

        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push(Routes.SUPPORT.NEW)}
          accessibilityRole="button"
          accessibilityLabel="Start a new support request"
        >
          <View style={styles.newBtnIcon}><Plus size={20} color={colors.white} /></View>
          <Text style={styles.newBtnText}>New support request</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Your requests</Text>

        {ticketsQuery.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : ticketsQuery.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>We could not load your requests.</Text>
            <TouchableOpacity
              onPress={() => ticketsQuery.refetch()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading support requests"
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={48} color={colors.textTertiary} />}
            title="No requests yet"
            description="When you message support, your conversations show up here."
          />
        ) : (
          <View style={[styles.ticketGrid, !isPhone && styles.ticketGridWide]}>
          {tickets.map((t: SupportTicket) => {
            const sc = statusColor(t.status);
            const unread = parseInt(t.message_count ?? '0', 10);
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.ticketCard, !isPhone && styles.ticketCardWide]}
                onPress={() => router.push(buildRoute(Routes.SUPPORT.THREAD, { id: t.id }))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Open support request ${t.ticket_number}`}
              >
                <View style={styles.ticketTop}>
                  <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusChipText, { color: sc.fg }]}>
                      {SUPPORT_STATUS_LABELS[t.status] ?? t.status}
                    </Text>
                  </View>
                  <Text style={styles.ticketWhen}>{formatWhen(t.updated_at)}</Text>
                </View>
                <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                <View style={styles.ticketBottom}>
                  <Text style={styles.ticketMeta}>
                    {SUPPORT_TYPE_LABELS[t.type] ?? t.type} · {t.ticket_number}
                    {unread > 0 ? ` · ${unread} message${unread === 1 ? '' : 's'}` : ''}
                  </Text>
                  <ChevronRight size={18} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>
            );
          })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl },
  bodyContentWide: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: spacing.xl },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.base, marginBottom: spacing.base },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    marginBottom: spacing.lg,
  },
  ticketGrid: { width: '100%' },
  ticketGridWide: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  newBtnIcon: { marginRight: spacing.sm },
  newBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  sectionLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  errorCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, alignItems: 'center' },
  errorText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ticketCardWide: { flexBasis: '48%', flexGrow: 1, marginHorizontal: spacing.xs },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  statusChipText: { ...typography.caption, fontWeight: '700' },
  ticketWhen: { ...typography.caption, color: colors.textTertiary },
  ticketSubject: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  ticketBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketMeta: { ...typography.caption, color: colors.textSecondary, flex: 1, marginRight: spacing.sm },
});
