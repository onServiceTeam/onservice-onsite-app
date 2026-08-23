import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';
import { getServiceScopeCopy } from '@/utils/serviceScope';

interface ServiceScopeNoticeProps {
  description: string | null | undefined;
  pricingType?: string | null;
}

export function ServiceScopeNotice({ description, pricingType }: ServiceScopeNoticeProps): React.ReactElement {
  const scope = getServiceScopeCopy(description, pricingType);

  return (
    <View style={[styles.card, !scope.isPublished && styles.pendingCard]}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>What this service covers</Text>
        {!scope.isPublished ? <Text style={styles.pendingLabel}>DETAILS PENDING</Text> : null}
      </View>
      <Text style={styles.copy}>{scope.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  pendingCard: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  pendingLabel: {
    ...typography.caption,
    color: colors.warningDark,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  copy: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
});

export default ServiceScopeNotice;
