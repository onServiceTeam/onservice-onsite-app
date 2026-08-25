import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Home, CheckCircle2 } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface AuthBrandPanelProps {
  eyebrow: string;
  title: string;
  description: string;
}

const BENEFITS = [
  'Compare provider profiles, service scope, and customer reviews.',
  'Keep quotes, chat, changes, photos, and support context with the booking.',
  'Treat payment as verified only when the booking shows paid and held.',
] as const;

export default function AuthBrandPanel({ eyebrow, title, description }: AuthBrandPanelProps): React.ReactElement {
  return (
    <View style={styles.panel} accessibilityLabel="onService account benefits">
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}><Home size={28} color={colors.primary} /></View>
        <Text style={styles.brandName}>onService PH</Text>
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <CheckCircle2 size={20} color={colors.white} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.marketNote}>Built for on-site services across the Philippines.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '42%',
    backgroundColor: colors.primary,
    padding: 48,
    justifyContent: 'center',
    borderTopLeftRadius: borderRadius.xl,
    borderBottomLeftRadius: borderRadius.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 48 },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { ...typography.h3, color: colors.white, fontWeight: '800' },
  eyebrow: { ...typography.caption, color: colors.white, fontWeight: '800', letterSpacing: 1.1, marginBottom: spacing.md, opacity: 0.82 },
  title: { ...typography.h1, color: colors.white, fontSize: 36, lineHeight: 42, marginBottom: spacing.md },
  description: { ...typography.body, color: 'rgba(255,255,255,0.88)', lineHeight: 24, marginBottom: spacing.xl },
  benefits: { gap: spacing.base },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  benefitText: { ...typography.bodySmall, color: colors.white, flex: 1, lineHeight: 21 },
  marketNote: { ...typography.caption, color: 'rgba(255,255,255,0.72)', marginTop: 48 },
});
