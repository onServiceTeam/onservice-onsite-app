/**
 * D38 Milestone 2 (package P5b): one pro's quote, as the customer sees it.
 *
 * Shows who the pro is (photo, or initials), their rating or "New on
 * onService" under 3 reviews, jobs completed, the price, how it compares
 * with the customer's budget (all decided by the server), what is included,
 * what could change the price, the earliest slot and how quickly they
 * responded.
 *
 * Deliberately not shown: a "Verified" badge (attorney hold on trust
 * wording, merged plan question 4) and any promise of protection.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Avatar from '@/components/Avatar';
import { Star } from '@/components/icons';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { describeSlot, respondedInLabel, type RequestQuote } from '@/services/request.service';

export interface QuoteCardProps {
  quote: RequestQuote;
  /** Accept and book: opens the confirm screen (nothing is accepted yet). */
  onAccept?: () => void;
  onDecline?: () => void;
  /** Present when the customer can message this pro. */
  onMessage?: () => void;
  busy?: boolean;
  /** For tests and previews; defaults to the device clock. */
  nowMs?: number;
}

/** "Within your budget", "₱500.00 above your budget", or null without a budget. */
export function budgetComparisonText(quote: Pick<RequestQuote, 'budget'>): string | null {
  const budget = quote.budget;
  if (!budget || budget.kind === 'no_budget') return null;
  if (budget.kind === 'within') return 'Within your budget';
  return `${formatPHP(budget.aboveBy ?? 0)} above your budget`;
}

const RESOLVED_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn by the pro',
  expired: 'Expired',
};

export function isQuoteLive(quote: Pick<RequestQuote, 'status' | 'expiresAt'>, nowMs: number = Date.now()): boolean {
  return quote.status === 'submitted' && new Date(quote.expiresAt).getTime() > nowMs;
}

export function QuoteCard({ quote, onAccept, onDecline, onMessage, busy = false, nowMs }: QuoteCardProps): React.ReactElement {
  const now = nowMs ?? Date.now();
  const provider = quote.provider;
  const name = provider?.name || 'Pro';
  const live = isQuoteLive(quote, now);
  const comparison = budgetComparisonText(quote);
  const slot = describeSlot(quote.earliestDate, quote.earliestTimeWindow, now);
  const responded = respondedInLabel(quote.respondedInMinutes);
  const resolvedLabel = !live
    ? (quote.status === 'submitted' ? 'Expired' : RESOLVED_LABELS[quote.status] ?? quote.status)
    : null;
  const jobs = provider?.jobsCompleted ?? 0;

  return (
    <View
      style={[styles.card, !live && styles.cardResolved]}
      accessibilityLabel={`Quote from ${name} for ${formatPHP(quote.quotedPrice)}`}
    >
      <View style={styles.providerRow}>
        <Avatar uri={provider?.photoUrl ?? null} name={name} size={48} />
        <View style={styles.providerCopy}>
          <Text style={styles.providerName}>{name}</Text>
          {!provider || provider.isNew ? (
            <Text style={styles.metaText}>New on onService</Text>
          ) : (
            <View style={styles.ratingRow} accessibilityLabel={`Rated ${Number(provider.ratingAverage).toFixed(1)} from ${provider.ratingCount} reviews`}>
              <Star size={13} color={colors.warning} />
              <Text style={styles.metaText}>{`${Number(provider.ratingAverage).toFixed(1)} (${provider.ratingCount} reviews)`}</Text>
            </View>
          )}
          <Text style={styles.metaText}>{`${jobs} ${jobs === 1 ? 'job' : 'jobs'} completed`}</Text>
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={styles.priceLabel}>Price for the job</Text>
        <Text style={styles.price}>{formatPHP(quote.quotedPrice)}</Text>
        {comparison ? (
          <Text style={[styles.comparison, quote.budget.kind === 'above' ? styles.comparisonAbove : styles.comparisonWithin]}>
            {comparison}
          </Text>
        ) : null}
        {/* The customer service fee is 0 today (Ken, 2026-06-28), so never
            promise a fee here; the confirm screen shows the server's exact total. */}
        <Text style={styles.feeNote}>You see the exact total on the next screen before you confirm.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>What is included</Text>
        <Text style={styles.sectionText}>{quote.description}</Text>
      </View>
      {quote.couldChangeIf ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Could change if</Text>
          <Text style={styles.sectionText}>{quote.couldChangeIf}</Text>
        </View>
      ) : null}
      {quote.lineItems && quote.lineItems.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Breakdown</Text>
          {quote.lineItems.map((item, index) => (
            <View key={item.id ?? index} style={styles.lineItem}>
              <Text style={styles.lineItemName}>{`${item.description} (${item.quantity} ${item.unit})`}</Text>
              <Text style={styles.lineItemTotal}>{formatPHP(item.lineTotal)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {slot ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Earliest they can start</Text>
          <Text style={styles.sectionText}>{slot}</Text>
        </View>
      ) : null}
      {responded ? <Text style={styles.metaText}>{responded}</Text> : null}

      {resolvedLabel ? (
        <View style={styles.resolvedBadge}>
          <Text style={styles.resolvedText}>{resolvedLabel}</Text>
        </View>
      ) : null}

      {live ? (
        <View style={styles.actions}>
          {onAccept ? (
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={onAccept}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Accept and book ${name}`}
            >
              <Text style={styles.acceptText}>Accept and book</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.secondaryRow}>
            {onDecline ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onDecline}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Decline quote from ${name}`}
              >
                <Text style={styles.secondaryText}>Decline</Text>
              </TouchableOpacity>
            ) : null}
            {onMessage ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onMessage}
                accessibilityRole="button"
                accessibilityLabel={`Message ${name}`}
              >
                <Text style={styles.secondaryText}>Message</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  cardResolved: { opacity: 0.75 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  providerCopy: { flex: 1, gap: 2 },
  providerName: { ...typography.h3, color: colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.caption, color: colors.textSecondary },
  priceBlock: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, padding: spacing.md, gap: 2 },
  priceLabel: { ...typography.caption, color: colors.textSecondary },
  price: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.text },
  comparison: { ...typography.bodySmall, fontWeight: '700' },
  comparisonWithin: { color: colors.success },
  comparisonAbove: { color: colors.warningDark },
  feeNote: { ...typography.caption, color: colors.textTertiary },
  section: { gap: 2 },
  sectionLabel: { ...typography.caption, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionText: { ...typography.bodySmall, color: colors.text },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  lineItemName: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  lineItemTotal: { ...typography.caption, fontWeight: '700', color: colors.text },
  resolvedBadge: { alignSelf: 'flex-start', backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  resolvedText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  actions: { gap: spacing.sm },
  acceptBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  acceptText: { ...typography.button, color: colors.white },
  secondaryRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: { flex: 1, minHeight: 44, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
});

export default QuoteCard;
