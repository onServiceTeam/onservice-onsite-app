/**
 * Phase 14 Dispatch 11 — StatusBadge
 *
 * Booking-status pill used across customer screens (bookings/index.tsx,
 * booking/[id].tsx, booking-history.tsx). Maps the canonical 11-state
 * booking machine to color + label so screens don't reinvent the mapping.
 * See Part 2B sections 14, 19, 30 for the bug references this consolidates.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';

// Phase K MED-K17 fix — added the missing real backend statuses
// (requested, quoted, payment_pending, resolved, payout_ready,
// paid_out) so screens don't fall through to the raw enum render.
// Source: packages/api/src/types/booking.types.ts VALID_TRANSITIONS.
export type BookingStatus =
  | 'requested'
  | 'quoted'
  | 'pending'
  | 'matched'
  | 'payment_pending'
  | 'paid'
  | 'provider_en_route'
  | 'provider_arrived'
  | 'in_progress'
  | 'completed_by_provider'
  | 'confirmed'
  | 'disputed'
  | 'resolved'
  | 'payout_ready'
  | 'paid_out'
  | 'cancelled_by_customer'
  | 'cancelled_by_provider'
  | 'cancelled_by_admin';

const STATUS_MAP: Record<BookingStatus, { bg: string; fg: string; label: string }> = {
  requested: { bg: '#FEF3C7', fg: colors.warningDark, label: 'Looking for provider' },
  quoted: { bg: colors.infoLight, fg: colors.info, label: 'Quote received' },
  pending: { bg: '#FEF3C7', fg: colors.warningDark, label: 'Pending' },
  matched: { bg: colors.primaryLight, fg: colors.primary, label: 'Matched' },
  payment_pending: { bg: '#FEF3C7', fg: colors.warningDark, label: 'Payment pending' },
  paid: { bg: colors.primaryLight, fg: colors.primary, label: 'Confirmed' },
  provider_en_route: { bg: colors.infoLight, fg: colors.info, label: 'On the way' },
  provider_arrived: { bg: colors.infoLight, fg: colors.info, label: 'Arrived' },
  in_progress: { bg: colors.successLight, fg: colors.successDark, label: 'In progress' },
  completed_by_provider: { bg: colors.successLight, fg: colors.successDark, label: 'Awaiting confirm' },
  confirmed: { bg: colors.successLight, fg: colors.successDark, label: 'Completed' },
  disputed: { bg: colors.errorLight, fg: colors.error, label: 'Disputed' },
  resolved: { bg: colors.successLight, fg: colors.successDark, label: 'Dispute resolved' },
  payout_ready: { bg: colors.successLight, fg: colors.successDark, label: 'Payout ready' },
  paid_out: { bg: colors.divider, fg: colors.textSecondary, label: 'Paid out' },
  // All three cancellation states intentionally render the same
  // user-facing label per Bug 901 (the variant distinction is visual
  // / via screen reader, not text). Don't differentiate the labels.
  cancelled_by_customer: { bg: colors.divider, fg: colors.textSecondary, label: 'Cancelled' },
  cancelled_by_provider: { bg: colors.divider, fg: colors.textSecondary, label: 'Cancelled' },
  cancelled_by_admin: { bg: colors.divider, fg: colors.textSecondary, label: 'Cancelled' },
};

export interface StatusBadgeProps {
  status: BookingStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps): React.ReactElement {
  const config = STATUS_MAP[status as BookingStatus] ?? {
    bg: colors.divider,
    fg: colors.textSecondary,
    label: String(status),
  };
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg },
        size === 'sm' && styles.smallBadge,
      ]}
      accessibilityLabel={`Status: ${config.label}`}
    >
      <Text
        style={[
          styles.label,
          { color: config.fg },
          size === 'sm' && styles.smallLabel,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  smallBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  label: { ...typography.bodySmall, fontWeight: '600' },
  smallLabel: { ...typography.caption, fontWeight: '600' },
});

export default StatusBadge;
