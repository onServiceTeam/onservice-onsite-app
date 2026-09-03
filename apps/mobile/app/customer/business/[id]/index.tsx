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
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getBusinessAccount,
  getContracts,
  getCurrentTerms,
  getInvoices,
  getMembers,
  type BusinessContract,
  type BusinessInvoice,
  type BusinessMember,
} from '@/services/business.service';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useResponsive } from '@/hooks/useResponsive';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { formatPHP } from '@/utils/currency';
import { Briefcase, Building2, ChevronLeft, ChevronRight, MessageSquare, Receipt, Users } from '@/components/icons';
import { ErrorState, SkeletonCard } from '@/components/ui';
import Badge from '@/components/ui/Badge';
import { buildRoute, Routes } from '@/config/navigation';

const STATUS_STYLE: Record<string, { color: string; background: string }> = {
  active: { color: colors.successDark, background: colors.successLight },
  pending: { color: colors.warningDark, background: colors.warningLight },
  suspended: { color: colors.error, background: colors.errorLight },
  sent: { color: colors.infoDark, background: colors.infoLight },
  overdue: { color: colors.error, background: colors.errorLight },
  paid: { color: colors.successDark, background: colors.successLight },
  settled: { color: colors.successDark, background: colors.successLight },
  credit_due: { color: colors.warningDark, background: colors.warningLight },
  draft: { color: colors.textSecondary, background: colors.backgroundSecondary },
  cancelled: { color: colors.textSecondary, background: colors.backgroundSecondary },
  closed: { color: colors.textSecondary, background: colors.backgroundSecondary },
};

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string | null): string {
  if (!value) return 'Ongoing';
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function permissionSummary(member: BusinessMember): string {
  const permissions = [
    member.canBook ? 'can request work' : null,
    member.canApprove ? 'can approve' : null,
    member.canViewInvoices ? 'can view statements' : null,
  ].filter(Boolean);
  return permissions.length > 0 ? permissions.join(' · ') : 'No company actions assigned';
}

function ContractCard({ contract }: { contract: BusinessContract }): React.ReactElement {
  const status = STATUS_STYLE[contract.status] ?? STATUS_STYLE.closed!;
  return (
    <View style={styles.recordCard} accessibilityLabel={`${contract.status} company contract`}>
      <View style={styles.recordTop}>
        <Text style={styles.recordTitle}>{label(contract.contractType)} service agreement</Text>
        <Badge label={label(contract.status)} color={status.color} backgroundColor={status.background} />
      </View>
      <Text style={styles.recordMeta}>{contract.frequency ? `${label(contract.frequency)} · ` : ''}{date(contract.startDate)} to {date(contract.endDate)}</Text>
      <Text style={styles.recordAmount}>{formatPHP(contract.agreedRate)} agreed service rate</Text>
      <Text style={styles.recordMeta}>{contract.providerId ? 'Assigned provider recorded' : 'Provider assigned per eligible job'}</Text>
      {contract.status === 'draft' ? <Text style={styles.holdText}>Draft only. onService must publish it before it can govern a company booking.</Text> : null}
    </View>
  );
}

function InvoiceCard({ accountId, invoice }: { accountId: string; invoice: BusinessInvoice }): React.ReactElement {
  const router = useRouter();
  const state = invoice.settlementState === 'legacy_unreviewed' ? invoice.status : invoice.settlementState;
  const status = STATUS_STYLE[state] ?? STATUS_STYLE.closed!;
  return (
    <TouchableOpacity
      style={styles.recordCard}
      onPress={() => router.push(buildRoute(Routes.CUSTOMER.BUSINESS_INVOICE_DETAIL, { id: accountId, invoiceId: invoice.id }))}
      accessibilityRole="button"
      accessibilityLabel={`Open statement ${invoice.invoiceNumber}`}
      activeOpacity={0.7}
    >
      <View style={styles.recordTop}>
        <Text style={styles.recordTitle}>{invoice.invoiceNumber}</Text>
        <Badge label={label(state)} color={status.color} backgroundColor={status.background} />
      </View>
      <Text style={styles.recordMeta}>{date(invoice.billingPeriodStart)} to {date(invoice.billingPeriodEnd)}</Text>
      <View style={styles.invoiceBottom}>
        <Text style={styles.recordAmount}>{formatPHP(invoice.totalAmount)}</Text>
        <ChevronRight size={18} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

export default function BusinessAccountWorkspaceScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const featureFlags = useFeatureFlags();
  const { isPhone } = useResponsive();

  const accountQuery = useQuery({
    queryKey: ['customer-business-account', accountId],
    queryFn: () => getBusinessAccount(accountId),
    enabled: accountId.length > 0,
  });
  const membersQuery = useQuery({
    queryKey: ['customer-business-members', accountId],
    queryFn: () => getMembers(accountId),
    enabled: accountId.length > 0,
  });
  // The account projection is the server's authoritative viewer-specific
  // permission result. The team list is presentation data and may fail or load
  // later without silently changing financial access.
  const canViewFinancials = accountQuery.data?.viewerPermissions.canViewFinancials === true;
  const termsQuery = useQuery({
    queryKey: ['customer-business-terms', accountId],
    queryFn: () => getCurrentTerms(accountId),
    enabled: accountId.length > 0 && canViewFinancials,
  });
  const contractsQuery = useInfiniteQuery({
    queryKey: ['customer-business-contracts', accountId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getContracts(accountId, pageParam, 20),
    getNextPageParam: (lastPage, pages) => pages.reduce((n, page) => n + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined,
    enabled: accountId.length > 0 && canViewFinancials,
  });
  const invoicesQuery = useInfiniteQuery({
    queryKey: ['customer-business-invoices', accountId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getInvoices(accountId, pageParam, 20),
    getNextPageParam: (lastPage, pages) => pages.reduce((n, page) => n + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined,
    enabled: accountId.length > 0 && canViewFinancials,
  });

  const contracts = (contractsQuery.data?.pages ?? []).flatMap((page) => page.items);
  const invoices = (invoicesQuery.data?.pages ?? []).flatMap((page) => page.items);
  const refreshing = accountQuery.isRefetching || membersQuery.isRefetching
    || contractsQuery.isRefetching
    || (canViewFinancials && (termsQuery.isRefetching || invoicesQuery.isRefetching));

  function refresh(): void {
    const requests: Array<Promise<unknown>> = [
      accountQuery.refetch(), membersQuery.refetch(),
    ];
    if (canViewFinancials) {
      requests.push(termsQuery.refetch(), contractsQuery.refetch(), invoicesQuery.refetch());
    }
    void Promise.all(requests);
  }

  if (!accountId) return <ErrorState title="Company not found" message="The company workspace link is incomplete." />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back from company workspace" style={styles.headerButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Company workspace</Text>
        <View style={styles.headerButton} />
      </View>

      {accountQuery.isLoading ? (
        <View style={styles.content}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
      ) : accountQuery.isError || !accountQuery.data ? (
        <ErrorState title="Company workspace unavailable" message="We couldn't load this company or you no longer have access." onRetry={() => void accountQuery.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Building2 size={26} color={colors.primary} /></View>
            <View style={styles.heroCopy}>
              <View style={styles.heroHeading}>
                <Text style={styles.companyName}>{accountQuery.data.companyName}</Text>
                <Badge
                  label={label(accountQuery.data.status)}
                  color={(STATUS_STYLE[accountQuery.data.status] ?? STATUS_STYLE.closed!).color}
                  backgroundColor={(STATUS_STYLE[accountQuery.data.status] ?? STATUS_STYLE.closed!).background}
                />
              </View>
              <Text style={styles.companyMeta}>{label(accountQuery.data.businessType)} · {accountQuery.data.city}, {accountQuery.data.province}</Text>
              <Text style={styles.companyMeta}>Your role: {label(accountQuery.data.viewerPermissions.role)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.supportAction}
            onPress={() => router.push({
              pathname: Routes.SUPPORT.NEW,
              params: {
                businessAccountId: accountQuery.data.id,
                businessName: accountQuery.data.companyName,
                type: 'general_inquiry',
                subject: `Help with ${accountQuery.data.companyName}`,
              },
            })}
            accessibilityRole="button"
            accessibilityLabel={`Get support for ${accountQuery.data.companyName}`}
          >
            <MessageSquare size={20} color={colors.primary} />
            <View style={styles.supportActionCopy}>
              <Text style={styles.supportActionTitle}>Get company support</Text>
              <Text style={styles.supportActionText}>Send this company account to support so the case stays connected to the right workspace.</Text>
            </View>
            <ChevronRight size={18} color={colors.primary} />
          </TouchableOpacity>

          {!featureFlags.businessContractBookingEnabled ? (
            <View style={styles.launchHold} accessibilityRole="text" accessibilityLabel="Company booking launch status">
              <Text style={styles.launchHoldTitle}>Company-paid booking is not open yet</Text>
              <Text style={styles.launchHoldText}>You can review company records now. New company billing remains paused while onService verifies provider settlement, cancellations, and disputes end to end. Personal booking is unchanged.</Text>
            </View>
          ) : null}

          {canViewFinancials ? (
            <View style={[styles.metrics, !isPhone && styles.metricsWide]}>
              <View style={styles.metric}><Text style={styles.metricLabel}>Approved terms</Text><Text style={styles.metricValue}>{termsQuery.data ? `Version ${termsQuery.data.version}` : 'Not published'}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>Payment terms</Text><Text style={styles.metricValue}>{termsQuery.data ? label(termsQuery.data.paymentTerms) : '—'}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>Volume discount</Text><Text style={styles.metricValue}>{termsQuery.data ? `${termsQuery.data.volumeDiscountRate}%` : '—'}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>Approved credit</Text><Text style={styles.metricValue}>{termsQuery.data ? formatPHP(termsQuery.data.monthlyCreditLimit) : '—'}</Text></View>
            </View>
          ) : membersQuery.isSuccess ? (
            <View style={styles.permissionNotice} accessibilityRole="text">
              <Text style={styles.permissionNoticeTitle}>Financial details are restricted</Text>
              <Text style={styles.permissionNoticeText}>Your company role can review the team. Ask an owner or manager for financial access if you need rates, service agreements, terms, or statements.</Text>
            </View>
          ) : null}

          <View style={[styles.workspace, !isPhone && styles.workspaceWide]}>
            <View style={styles.column}>
              <SectionHeading icon={<Users size={19} color={colors.primary} />} title="Team and permissions" subtitle="Your role controls what company records and future actions you can use." />
              {membersQuery.isError ? <SectionError text="Team access could not be loaded." /> : (membersQuery.data ?? []).map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName}>{`${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.email || 'Company member'}</Text>
                    <Text style={styles.recordMeta}>{permissionSummary(member)}</Text>
                  </View>
                  <Badge label={label(member.role)} color={colors.primary} backgroundColor={colors.primaryLight} />
                </View>
              ))}
            </View>

            {canViewFinancials ? (
              <View style={styles.column}>
                <SectionHeading icon={<Briefcase size={19} color={colors.primary} />} title="Provider contracts" subtitle="Only contracts published by onService can govern future company work." />
                {contractsQuery.isError ? <SectionError text="Contracts could not be loaded." /> : contracts.length === 0 ? <SectionEmpty text="No provider contracts are recorded." /> : contracts.map((contract) => <ContractCard key={contract.id} contract={contract} />)}
                {contractsQuery.hasNextPage ? <LoadMore label="Load more contracts" loading={contractsQuery.isFetchingNextPage} onPress={() => void contractsQuery.fetchNextPage()} /> : null}
              </View>
            ) : null}
          </View>

          {canViewFinancials ? (
            <View style={styles.section}>
              <SectionHeading icon={<Receipt size={19} color={colors.primary} />} title="Commercial statements" subtitle="Statements show finalized company work, adjustments, payments, and any credit owed. Internal drafts never appear here." />
              {invoicesQuery.isError ? <SectionError text="Statements could not be loaded." /> : invoices.length === 0 ? <SectionEmpty text="No finalized statements are available." /> : (
                <View style={[styles.invoiceGrid, !isPhone && styles.invoiceGridWide]}>
                  {invoices.map((invoice) => <InvoiceCard key={invoice.id} accountId={accountId} invoice={invoice} />)}
                </View>
              )}
              {invoicesQuery.hasNextPage ? <LoadMore label="Load more statements" loading={invoicesQuery.isFetchingNextPage} onPress={() => void invoicesQuery.fetchNextPage()} /> : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }): React.ReactElement {
  return <View style={styles.sectionHeading}><View style={styles.sectionTitleRow}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>;
}
function SectionError({ text }: { text: string }): React.ReactElement { return <Text role="alert" style={styles.sectionError}>{text} Pull down to retry.</Text>; }
function SectionEmpty({ text }: { text: string }): React.ReactElement { return <Text style={styles.sectionEmpty}>{text}</Text>; }
function LoadMore({ label: text, loading, onPress }: { label: string; loading: boolean; onPress: () => void }): React.ReactElement {
  return <TouchableOpacity style={styles.loadMore} onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={text}><Text style={styles.loadMoreText}>{loading ? 'Loading…' : text}</Text></TouchableOpacity>;
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
  companyName: { ...typography.h2, color: colors.text, flexShrink: 1 },
  companyMeta: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  supportAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.base },
  supportActionCopy: { flex: 1, minWidth: 0 },
  supportActionTitle: { ...typography.body, color: colors.primary, fontWeight: '800' },
  supportActionText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: 2 },
  launchHold: { borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningLight, borderRadius: borderRadius.lg, padding: spacing.base },
  launchHoldTitle: { ...typography.body, color: colors.warningDark, fontWeight: '800' },
  launchHoldText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  metrics: { gap: spacing.sm },
  metricsWide: { flexDirection: 'row' },
  metric: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.base },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  metricValue: { ...typography.body, color: colors.text, fontWeight: '800', marginTop: spacing.xs },
  permissionNotice: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base },
  permissionNoticeTitle: { ...typography.body, color: colors.text, fontWeight: '800' },
  permissionNoticeText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  workspace: { gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xl, padding: spacing.base },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xl, padding: spacing.base },
  sectionHeading: { marginBottom: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  recordCard: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  recordTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  recordTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '800', flex: 1 },
  recordMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  recordAmount: { ...typography.bodySmall, color: colors.text, fontWeight: '800', marginTop: spacing.sm },
  holdText: { ...typography.caption, color: colors.warningDark, marginTop: spacing.sm, lineHeight: 17 },
  invoiceBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  invoiceGrid: { gap: spacing.sm },
  invoiceGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  sectionError: { ...typography.bodySmall, color: colors.error, paddingVertical: spacing.md },
  sectionEmpty: { ...typography.bodySmall, color: colors.textSecondary, paddingVertical: spacing.md },
  loadMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md, marginTop: spacing.sm },
  loadMoreText: { ...typography.bodySmall, color: colors.primary, fontWeight: '800' },
});
