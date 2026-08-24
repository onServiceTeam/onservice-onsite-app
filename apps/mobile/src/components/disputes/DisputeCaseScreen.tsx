import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getBookingById,
  getDisputeById,
  respondToDispute,
  type DisputeRecord,
} from '@/services/booking.service';
import { Button, Card, ConfirmModal, ErrorState, SectionHeader, SkeletonCard } from '@/components/ui';
import { ChevronLeft, Scale, ImageIcon, MessageSquare, Receipt, ShieldCheck } from '@/components/icons';
import { showToast } from '@/lib/toast';
import { getErrorMessage } from '@/utils/errors';
import { formatDateTime, formatBookingRef } from '@/utils/date';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

type DisputeRole = 'customer' | 'provider';
type ProviderAction = 'contest';

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
  open: 'Waiting for provider response',
  under_review: 'Under support review',
  escalated: 'Escalated review',
  resolved: 'Resolved',
};

const ACTIONS: Array<{ id: ProviderAction; title: string; detail: string }> = [
  { id: 'contest', title: 'Contest the claim', detail: 'Send your response to the support review queue.' },
];

function statusStyle(status: DisputeRecord['status']): object {
  if (status === 'resolved') return styles.statusResolved;
  if (status === 'escalated') return styles.statusEscalated;
  if (status === 'under_review') return styles.statusReview;
  return styles.statusOpen;
}

export default function DisputeCaseScreen({ role }: { role: DisputeRole }): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [providerAction, setProviderAction] = useState<ProviderAction>('contest');
  const [response, setResponse] = useState('');
  const [confirmProviderAction, setConfirmProviderAction] = useState(false);

  const disputeQuery = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => getDisputeById(id ?? ''),
    enabled: !!id,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
  const dispute = disputeQuery.data;

  const bookingQuery = useQuery({
    queryKey: ['booking', dispute?.bookingId],
    queryFn: () => getBookingById(dispute!.bookingId),
    enabled: !!dispute?.bookingId,
    staleTime: 30 * 1000,
  });
  const booking = bookingQuery.data;

  const refreshCase = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['dispute', id] });
    void queryClient.invalidateQueries({ queryKey: ['myDisputes'] });
    if (dispute?.bookingId) void queryClient.invalidateQueries({ queryKey: ['booking', dispute.bookingId] });
  };

  const providerMutation = useMutation({
    mutationFn: async () => {
      return respondToDispute(id ?? '', {
        response: response.trim(),
        action: providerAction,
      });
    },
    onSuccess: () => {
      setConfirmProviderAction(false);
      refreshCase();
      showToast(
        'Your response was sent for support review.',
        'success',
      );
    },
    onError: (error: unknown) => {
      setConfirmProviderAction(false);
      showToast(getErrorMessage(error, 'Could not submit your dispute response.'), 'error');
    },
  });

  const validateProviderResponse = (): void => {
    if (response.trim().length < 20) {
      showToast('Your response must be at least 20 characters.', 'warning');
      return;
    }
    setConfirmProviderAction(true);
  };

  if (disputeQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContent}><SkeletonCard /><SkeletonCard /></View>
      </View>
    );
  }

  if (disputeQuery.isError || !dispute) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load this dispute case. Please check your connection and try again."
          onRetry={() => void disputeQuery.refetch()}
        />
      </View>
    );
  }

  const hasPartialOffer = dispute.status === 'open' && !!dispute.providerRespondedAt && dispute.refundAmount > 0;
  const providerCanRespond = role === 'provider' && dispute.status === 'open' && !dispute.providerRespondedAt;
  const bookingRoute = role === 'customer'
    ? buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: dispute.bookingId })
    : buildRoute(Routes.PROVIDER.JOB_DETAIL, { id: dispute.bookingId });
  const counterparty = role === 'customer' ? dispute.providerName : dispute.customerName;
  const confirmTitle = 'Contest this claim?';
  const confirmMessage = 'Your response and the customer evidence will be sent to the support review queue.';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Dispute Case</Text>
          <Text style={styles.headerSubtitle}>Case {dispute.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={[styles.statusPill, statusStyle(dispute.status)]}>
          <Text style={styles.statusText}>{STATUS_LABELS[dispute.status]}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, !isPhone && styles.contentWide]}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[styles.workspace, !isPhone && styles.workspaceWide]}
            accessibilityLabel={!isPhone ? `Wide ${role} dispute case workspace` : `${role} dispute case`}
          >
            <View style={styles.caseRecord}>
              <Card style={styles.card}>
                <View style={styles.titleRow}>
                  <Scale size={24} color={colors.primary} />
                  <View style={styles.titleCopy}>
                    <Text style={styles.caseTitle}>{TYPE_LABELS[dispute.type]}</Text>
                    <Text style={styles.caseMeta}>Filed {formatDateTime(dispute.createdAt)}</Text>
                  </View>
                </View>
                <Text style={styles.description}>{dispute.description}</Text>
              </Card>

              <Card style={styles.card}>
                <SectionHeader title="Booking context" />
                <Text style={styles.label}>Booking</Text>
                <Text style={styles.value}>{formatBookingRef(dispute.bookingId, booking?.createdAt ?? dispute.createdAt)}</Text>
                <Text style={styles.label}>{role === 'customer' ? 'Provider' : 'Customer'}</Text>
                <Text style={styles.value}>{counterparty || booking?.providerName || booking?.customerName || 'Booking participant'}</Text>
                {booking ? (
                  <>
                    <Text style={styles.label}>Service</Text>
                    <Text style={styles.value}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
                    <Text style={styles.label}>Booking total</Text>
                    <Text style={styles.value}>{formatPHP(booking.totalAmount)}</Text>
                  </>
                ) : null}
                <Button title={role === 'customer' ? 'Open Booking' : 'Open Job'} onPress={() => router.push(bookingRoute)} variant="outline" />
              </Card>

              <Card style={styles.card}>
                <SectionHeader title="Customer evidence" />
                {dispute.evidence && dispute.evidence.length > 0 ? (
                  <View style={styles.evidenceGrid}>
                    {dispute.evidence.map((evidence) => (
                      <View key={evidence.id} style={styles.evidenceCard}>
                        {evidence.evidenceType === 'photo' ? (
                          <Image source={{ uri: evidence.fileUrl }} style={styles.evidenceImage} />
                        ) : (
                          <View style={styles.evidenceFile}><ImageIcon size={28} color={colors.primary} /></View>
                        )}
                        <Text style={styles.evidenceLabel}>{evidence.evidenceType}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.muted}>No evidence files were attached to this claim.</Text>
                )}
              </Card>

              {dispute.providerResponse ? (
                <Card style={styles.card}>
                  <SectionHeader title="Provider response" />
                  <Text style={styles.description}>{dispute.providerResponse}</Text>
                  {dispute.providerRespondedAt ? <Text style={styles.caseMeta}>Sent {formatDateTime(dispute.providerRespondedAt)}</Text> : null}
                </Card>
              ) : null}

              {dispute.status === 'resolved' ? (
                <Card style={styles.card}>
                  <SectionHeader title="Decision" />
                  <Text style={styles.value}>{dispute.resolutionType?.replace(/_/g, ' ') || 'Case resolved'}</Text>
                  {dispute.refundAmount > 0 ? <Text style={styles.refundValue}>Refund: {formatPHP(dispute.refundAmount)}</Text> : null}
                  {dispute.decisionNotes ? <Text style={styles.description}>{dispute.decisionNotes}</Text> : null}
                </Card>
              ) : null}
            </View>

            <View style={[styles.actionRail, !isPhone && styles.actionRailWide]} accessibilityLabel="Dispute status and actions">
              {providerCanRespond ? (
                <Card style={styles.card}>
                  <SectionHeader title="Respond to the claim" />
                  <Text style={styles.helper}>Choose one outcome and give a factual response. Support and the customer will see this record.</Text>
                  <View style={styles.actionOptions}>
                    {ACTIONS.map((action) => (
                      <TouchableOpacity
                        key={action.id}
                        style={[styles.actionOption, providerAction === action.id && styles.actionOptionSelected]}
                        onPress={() => setProviderAction(action.id)}
                      >
                        <View style={styles.radioOuter}>{providerAction === action.id ? <View style={styles.radioInner} /> : null}</View>
                        <View style={styles.actionCopy}>
                          <Text style={styles.actionTitle}>{action.title}</Text>
                          <Text style={styles.actionDetail}>{action.detail}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.settlementHold}>
                    <Text style={styles.settlementHoldTitle}>Refund settlements are handled by support</Text>
                    <Text style={styles.settlementHoldText}>Direct full-refund acceptance and partial-refund offers are temporarily held while escrow timing is corrected. Contesting preserves your response and moves the case to staff review.</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Your response</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={response}
                      onChangeText={setResponse}
                      multiline
                      maxLength={2000}
                      textAlignVertical="top"
                      placeholder="Explain what happened, what work was completed, and what you want support to review."
                      placeholderTextColor={colors.textTertiary}
                      accessibilityLabel="Provider dispute response"
                    />
                    <Text style={styles.fieldHint}>{response.trim().length}/20 minimum</Text>
                  </View>
                  <Button title="Review Response" onPress={validateProviderResponse} />
                </Card>
              ) : null}

              {role === 'provider' && dispute.providerRespondedAt ? (
                <Card style={styles.card}>
                  <ShieldCheck size={24} color={colors.success} />
                  <Text style={styles.railTitle}>Response recorded</Text>
                  <Text style={styles.helper}>Your response is part of the case. Watch this screen and notifications for the decision.</Text>
                </Card>
              ) : null}

              {role === 'customer' && hasPartialOffer ? (
                <Card style={styles.offerCard}>
                  <Receipt size={24} color={colors.success} />
                  <Text style={styles.railTitle}>Partial refund offer</Text>
                  <Text style={styles.offerAmount}>{formatPHP(dispute.refundAmount)}</Text>
                  <Text style={styles.helper}>The provider previously offered this amount as a possible resolution.</Text>
                  <Text style={styles.settlementHoldText}>Direct acceptance is temporarily unavailable while escrow settlement is corrected. Contact support to have the offer reviewed and any approved outcome recorded in the case.</Text>
                </Card>
              ) : null}

              <Card style={styles.card}>
                <MessageSquare size={24} color={colors.primary} />
                <Text style={styles.railTitle}>Need support?</Text>
                <Text style={styles.helper}>Open a support case if you need help using this dispute record. The dispute decision remains in this case.</Text>
                <Button
                  title="Contact Support"
                  variant="outline"
                  onPress={() => router.push({
                    pathname: '/support/new',
                    params: {
                      bookingId: dispute.bookingId,
                      type: 'booking_issue',
                      subject: `Help with dispute ${dispute.id.slice(0, 8).toUpperCase()}`,
                    },
                  })}
                />
              </Card>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirmProviderAction}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Contest Claim"
        loading={providerMutation.isPending}
        onCancel={() => setConfirmProviderAction(false)}
        onConfirm={() => providerMutation.mutate()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  loadingContent: { padding: spacing.base, gap: spacing.base },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  backButton: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  statusPill: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  statusOpen: { backgroundColor: colors.warningLight },
  statusReview: { backgroundColor: colors.primaryLight },
  statusEscalated: { backgroundColor: colors.errorLight },
  statusResolved: { backgroundColor: colors.successLight },
  statusText: { ...typography.caption, color: colors.text, fontWeight: '700' },
  content: { padding: spacing.base, paddingBottom: 80 },
  contentWide: { width: '100%', maxWidth: 1160, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  caseRecord: { flex: 1, minWidth: 0 },
  actionRail: { width: '100%' },
  actionRailWide: { width: 360, minWidth: 0 },
  card: { marginBottom: spacing.base },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleCopy: { flex: 1 },
  caseTitle: { ...typography.h2, color: colors.text },
  caseMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  description: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginTop: spacing.md },
  label: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.md, marginBottom: 2 },
  value: { ...typography.body, color: colors.text, fontWeight: '600', marginBottom: spacing.sm },
  muted: { ...typography.bodySmall, color: colors.textTertiary },
  refundValue: { ...typography.h3, color: colors.success, marginTop: spacing.sm },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  evidenceCard: { width: 112 },
  evidenceImage: { width: 112, height: 88, borderRadius: borderRadius.md, backgroundColor: colors.backgroundSecondary },
  evidenceFile: { width: 112, height: 88, borderRadius: borderRadius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  evidenceLabel: { ...typography.caption, color: colors.textSecondary, textTransform: 'capitalize', marginTop: spacing.xs },
  helper: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm, marginBottom: spacing.md },
  actionOptions: { gap: spacing.sm, marginBottom: spacing.md },
  actionOption: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md },
  actionOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  actionCopy: { flex: 1 },
  actionTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  actionDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  field: { marginBottom: spacing.md },
  fieldLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, minHeight: 48, paddingHorizontal: spacing.md, color: colors.text },
  textArea: { minHeight: 132, paddingTop: spacing.md },
  fieldHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs, textAlign: 'right' },
  settlementHold: { backgroundColor: colors.warningLight, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  settlementHoldTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  settlementHoldText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  railTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  offerCard: { marginBottom: spacing.base, borderColor: colors.success, backgroundColor: colors.successLight },
  offerAmount: { ...typography.price, color: colors.success, marginTop: spacing.sm },
});
