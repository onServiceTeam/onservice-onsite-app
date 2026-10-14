/**
 * Shown instead of the message box when a thread is read-only (merged plan
 * 2.2). The thread stays readable and messages can still be reported.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ConversationStateReason } from '@/config/realtime-events';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Lock } from '@/components/icons';

export function readOnlyCopy(reason: ConversationStateReason | null | undefined, viewerRole: 'customer' | 'provider'): string {
  const customer = viewerRole === 'customer';
  switch (reason) {
    case 'quote_declined':
      return customer ? 'You declined this pro’s quote, so this conversation is closed.' : 'The customer declined your quote, so this conversation is closed.';
    case 'quote_expired':
      return customer ? 'This pro’s quote expired, so this conversation is closed.' : 'Your quote expired, so this conversation is closed.';
    case 'quote_withdrawn':
      return customer ? 'This pro withdrew their quote, so this conversation is closed.' : 'You withdrew your quote, so this conversation is closed.';
    case 'other_provider_booked':
      return customer ? 'You booked another pro, so this conversation is closed.' : 'The customer booked another pro, so this conversation is closed.';
    case 'request_cancelled':
      return 'This request was cancelled, so this conversation is closed.';
    case 'provider_reassigned':
      return customer
        ? 'This job moved to another pro, so this conversation is closed. Message your new pro from the booking.'
        : 'This job was moved to another pro, so this conversation is closed.';
    default:
      return 'This conversation is closed.';
  }
}

export function ReadOnlyBanner({
  reason,
  viewerRole,
  bottomInset = 0,
}: {
  reason: ConversationStateReason | null | undefined;
  viewerRole: 'customer' | 'provider';
  bottomInset?: number;
}): React.ReactElement {
  return (
    <View
      style={[styles.banner, { paddingBottom: bottomInset + spacing.md }]}
      accessibilityRole="summary"
      accessibilityLabel="This conversation is read-only"
    >
      <Lock size={18} color={colors.textSecondary} />
      <View style={styles.text}>
        <Text style={styles.title}>{readOnlyCopy(reason, viewerRole)}</Text>
        <Text style={styles.subtitle}>You can still read it and report a message.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.backgroundSecondary,
    borderBottomLeftRadius: borderRadius.sm,
  },
  text: { flex: 1 },
  title: { ...typography.body, color: colors.text, fontWeight: '600' },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});

export default ReadOnlyBanner;
