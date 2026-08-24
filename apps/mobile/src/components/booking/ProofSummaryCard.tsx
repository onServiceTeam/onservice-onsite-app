import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, Shield } from '@/components/icons';
import Card from '@/components/ui/Card';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { BookingProofSummary } from '@/services/booking-proof.service';

interface ProofSummaryCardProps {
  summary: BookingProofSummary;
  audience: 'customer' | 'provider';
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

export default function ProofSummaryCard({
  summary,
  audience,
}: ProofSummaryCardProps): React.ReactElement {
  const providerAfterPhotos = summary.photos.filter(
    (photo) =>
      photo.source === 'canonical' &&
      photo.photoType === 'after' &&
      photo.uploadedByRole === 'provider',
  ).length;
  const checklistProgress = summary.checklist
    ? `${summary.checklist.completedRequiredItems}/${summary.checklist.requiredItems}`
    : 'Not opened';
  const title = audience === 'provider' ? 'Proof to complete' : 'Work record';
  const stageColor = summary.readiness.readyForProviderCompletion ? colors.success : colors.primary;

  return (
    <Card style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.titleWrap}>
          <Shield size={18} color={colors.primary} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={[styles.stagePill, { backgroundColor: `${stageColor}18` }]}>
          <Text style={[styles.stageText, { color: stageColor }]}>
            {summary.readiness.readyForProviderCompletion
              ? 'Ready to submit'
              : humanize(summary.readiness.stage)}
          </Text>
        </View>
      </View>

      <Text style={styles.intro}>
        {audience === 'provider'
          ? 'The customer and support team see this same booking proof, with role-appropriate details.'
          : 'Scope, provider checklist, photos, changes, and closeout stay connected to this booking.'}
      </Text>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <ClipboardList size={17} color={colors.secondary} />
          <Text style={styles.metricLabel}>Checklist</Text>
          <Text style={styles.metricValue}>{checklistProgress}</Text>
        </View>
        <View style={styles.metric}>
          <Camera size={17} color={colors.secondary} />
          <Text style={styles.metricLabel}>After photos</Text>
          <Text style={styles.metricValue}>
            {providerAfterPhotos}/{summary.readiness.afterPhotosRequired}
          </Text>
        </View>
        <View style={styles.metric}>
          <CheckCircle2 size={17} color={colors.secondary} />
          <Text style={styles.metricLabel}>Changes</Text>
          <Text style={styles.metricValue}>{summary.changeOrders.length}</Text>
        </View>
      </View>

      {summary.readiness.blockers.length > 0 ? (
        <View style={styles.blockers}>
          <Text style={styles.blockerHeading}>
            {audience === 'provider' ? 'Before you can submit completion' : 'Current proof status'}
          </Text>
          {summary.readiness.blockers.map((blocker) => (
            <View key={blocker.code} style={styles.blockerRow}>
              <AlertTriangle size={15} color={colors.warning} />
              <Text style={styles.blockerText}>{blocker.message}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.readyText}>No current provider-completion blockers are recorded.</Text>
      )}

      {summary.checklist && summary.checklist.items.length > 0 && (
        <View style={styles.items}>
          {summary.checklist.items.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <CheckCircle2
                size={15}
                color={item.completed ? colors.success : colors.textTertiary}
              />
              <Text style={[styles.itemText, item.completed && styles.itemDone]} numberOfLines={2}>
                {item.title}
              </Text>
              {item.photoRequired && <Text style={styles.photoRequired}>Photo</Text>}
            </View>
          ))}
          {summary.checklist.items.length > 4 && (
            <Text style={styles.moreItems}>+{summary.checklist.items.length - 4} more checklist item(s)</Text>
          )}
        </View>
      )}

      {summary.signatures.records.length > 0 && (
        <View style={styles.caution}>
          <Text style={styles.cautionText}>
            Signature identity is still under review. The record shows the authenticated uploader, not independently verified signer identity.
          </Text>
        </View>
      )}

      {summary.dispute && (
        <Text style={styles.disputeText}>
          Dispute: {humanize(summary.dispute.type)} · {humanize(summary.dispute.status)}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.base },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  title: { ...typography.h3, color: colors.text },
  stagePill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  stageText: { ...typography.caption, fontWeight: '700', textTransform: 'capitalize' },
  intro: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm },
  metrics: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  metric: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  metricLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  metricValue: { ...typography.body, color: colors.text, fontWeight: '700' },
  blockers: { marginTop: spacing.base, gap: spacing.sm },
  blockerHeading: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  blockerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  blockerText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  readyText: { ...typography.bodySmall, color: colors.success, marginTop: spacing.base },
  items: { marginTop: spacing.base, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  itemDone: { color: colors.textSecondary },
  photoRequired: { ...typography.caption, color: colors.info, backgroundColor: colors.infoLight, paddingHorizontal: spacing.xs, borderRadius: borderRadius.sm },
  moreItems: { ...typography.caption, color: colors.textTertiary },
  caution: { marginTop: spacing.base, backgroundColor: colors.warningLight, borderRadius: borderRadius.md, padding: spacing.sm },
  cautionText: { ...typography.caption, color: colors.warningDark },
  disputeText: { ...typography.bodySmall, color: colors.error, marginTop: spacing.base, fontWeight: '600' },
});
