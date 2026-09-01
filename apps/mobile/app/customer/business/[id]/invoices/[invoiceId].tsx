import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getInvoiceDetail } from '@/services/business.service';
import { useResponsive } from '@/hooks/useResponsive';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { formatPHP } from '@/utils/currency';
import { ChevronLeft, ChevronRight, Receipt } from '@/components/icons';
import { ErrorState, SkeletonCard } from '@/components/ui';
import Badge from '@/components/ui/Badge';
import { buildRoute, Routes } from '@/config/navigation';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  });
}

export default function BusinessStatementScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; invoiceId?: string | string[] }>();
  const accountId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const invoiceId = Array.isArray(params.invoiceId) ? params.invoiceId[0] ?? '' : params.invoiceId ?? '';
  const { isPhone } = useResponsive();
  const query = useQuery({
    queryKey: ['customer-business-statement', accountId, invoiceId],
    queryFn: () => getInvoiceDetail(accountId, invoiceId),
    enabled: accountId.length > 0 && invoiceId.length > 0,
  });

  if (!accountId || !invoiceId) return <ErrorState title="Statement not found" message="The company statement link is incomplete." />;

  const statement = query.data;
  const settlementState = statement?.settlementState === 'legacy_unreviewed'
    ? statement.status : statement?.settlementState ?? 'legacy_unreviewed';
  const statusColor = settlementState === 'settled' || settlementState === 'paid'
    ? { text: colors.successDark, bg: colors.successLight }
    : settlementState === 'credit_due'
      ? { text: colors.warningDark, bg: colors.warningLight }
      : settlementState === 'overdue'
        ? { text: colors.error, bg: colors.errorLight }
        : { text: colors.infoDark, bg: colors.infoLight };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back from company statement" style={styles.headerButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Company statement</Text>
        <View style={styles.headerButton} />
      </View>

      {query.isLoading ? (
        <View style={styles.content}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
      ) : query.isError || !statement ? (
        <ErrorState title="Statement unavailable" message="This statement is not finalized, does not belong to this company, or your role cannot view statements." onRetry={() => void query.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Receipt size={27} color={colors.primary} /></View>
            <View style={styles.heroCopy}>
              <View style={styles.heroHeading}>
                <Text style={styles.statementNumber}>{statement.invoiceNumber}</Text>
                <Badge label={label(settlementState)} color={statusColor.text} backgroundColor={statusColor.bg} />
              </View>
              <Text style={styles.meta}>{date(statement.billingPeriodStart)} to {date(statement.billingPeriodEnd)}</Text>
              <Text style={styles.meta}>Due {date(statement.dueDate)} · {statement.currency}</Text>
            </View>
          </View>

          <View style={styles.notice} accessibilityLabel="Commercial statement classification">
            <Text style={styles.noticeTitle}>Commercial statement</Text>
            <Text style={styles.noticeText}>This record summarizes company work and account activity. It does not claim to be a Philippine principal invoice or official receipt.</Text>
          </View>

          <View style={[styles.metrics, !isPhone && styles.metricsWide]}>
            <Metric label="Original total" value={formatPHP(statement.totalAmount)} />
            <Metric label="Adjusted total" value={formatPHP(statement.balance.adjustedTotal)} />
            <Metric label="Payment evidence" value={formatPHP(statement.balance.paymentTotal)} />
            <Metric
              label={statement.balance.balanceDue < 0 ? 'Credit owed to company' : 'Balance due'}
              value={formatPHP(Math.abs(statement.balance.balanceDue))}
            />
          </View>

          <View style={[styles.workspace, !isPhone && styles.workspaceWide]}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Linked work</Text>
              <Text style={styles.sectionSubtitle}>Each line keeps the service date, agreed amount, discount, and booking link used when this statement was finalized.</Text>
              {statement.items.length === 0 ? <Text style={styles.emptyText}>No work lines are recorded.</Text> : statement.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.lineItem}
                  disabled={!item.bookingId}
                  onPress={() => item.bookingId && router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: item.bookingId }))}
                  accessibilityRole={item.bookingId ? 'button' : 'text'}
                  accessibilityLabel={item.bookingId ? `Open booking for ${item.description}` : item.description}
                >
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineTitle}>{item.description}</Text>
                    <Text style={styles.meta}>{date(item.serviceDate)} · {item.quantity} × {formatPHP(item.unitPrice)}</Text>
                    {item.discountAmount > 0 ? <Text style={styles.discount}>Discount {formatPHP(item.discountAmount)}</Text> : null}
                  </View>
                  <View style={styles.lineAmountWrap}>
                    <Text style={styles.lineAmount}>{formatPHP(item.amount)}</Text>
                    {item.bookingId ? <ChevronRight size={17} color={colors.primary} /> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account activity</Text>
              <Text style={styles.sectionSubtitle}>Credits, debits, write-offs, payments, and reversals are appended. Earlier records are never deleted or rewritten.</Text>
              {statement.ledger.adjustments.length === 0 && statement.ledger.payments.length === 0 ? (
                <Text style={styles.emptyText}>No adjustments or external payment evidence are recorded.</Text>
              ) : null}
              {statement.ledger.adjustments.map((entry) => (
                <View key={entry.id} style={styles.ledgerRow}>
                  <View><Text style={styles.ledgerTitle}>{label(entry.adjustmentType)}</Text><Text style={styles.meta}>{dateTime(entry.createdAt)}</Text></View>
                  <Text style={styles.ledgerAmount}>{entry.adjustmentType === 'debit' ? '+' : '−'}{formatPHP(entry.amount)}</Text>
                </View>
              ))}
              {statement.ledger.payments.map((entry) => (
                <View key={entry.id} style={styles.ledgerRow}>
                  <View style={styles.lineCopy}>
                    <Text style={styles.ledgerTitle}>{entry.entryType === 'payment' ? 'External payment evidence' : 'Payment reversal or refund'}</Text>
                    <Text style={styles.meta}>{label(entry.method)} · {entry.externalReference}</Text>
                    <Text style={styles.meta}>Effective {dateTime(entry.effectiveAt)}</Text>
                  </View>
                  <Text style={styles.ledgerAmount}>{entry.entryType === 'payment' ? '−' : '+'}{formatPHP(entry.amount)}</Text>
                </View>
              ))}
              <Text style={styles.evidenceNote}>External payment entries are recorded by an onService operator from supplied evidence. They are not a claim of live bank or PayMongo verification.</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string }): React.ReactElement {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{metricLabel}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.h3, color: colors.text },
  content: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: spacing.base, paddingBottom: 80, gap: spacing.base },
  hero: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xl, padding: spacing.lg },
  heroIcon: { width: 52, height: 52, borderRadius: borderRadius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0 },
  heroHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  statementNumber: { ...typography.h2, color: colors.text, flexShrink: 1 },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  notice: { borderWidth: 1, borderColor: colors.info, backgroundColor: colors.infoLight, borderRadius: borderRadius.lg, padding: spacing.base },
  noticeTitle: { ...typography.body, color: colors.infoDark, fontWeight: '800' },
  noticeText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  metrics: { gap: spacing.sm },
  metricsWide: { flexDirection: 'row' },
  metric: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.base },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  metricValue: { ...typography.body, color: colors.text, fontWeight: '800', marginTop: spacing.xs },
  workspace: { gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  section: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xl, padding: spacing.base },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs, marginBottom: spacing.md },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, paddingVertical: spacing.md },
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingVertical: spacing.md },
  lineCopy: { flex: 1, minWidth: 0 },
  lineTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  discount: { ...typography.caption, color: colors.successDark, marginTop: spacing.xs },
  lineAmountWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  lineAmount: { ...typography.bodySmall, color: colors.text, fontWeight: '800' },
  ledgerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingVertical: spacing.md },
  ledgerTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  ledgerAmount: { ...typography.bodySmall, color: colors.text, fontWeight: '800' },
  evidenceNote: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.xs },
});
