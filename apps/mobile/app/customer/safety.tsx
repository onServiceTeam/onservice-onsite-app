import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { formatPHP } from '@/utils/currency';
import type { ComponentType } from 'react';
import { CheckCircle2, Lock, Shield, Star } from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COVERAGE_CARDS: Array<{ icon: IconComponent; iconColor: string; title: string; desc: string }> = [
  {
    icon: CheckCircle2,
    iconColor: colors.success,
    title: 'Verified Pros',
    desc: 'Every provider is NBI-cleared, ID-verified, and rated by real customers.',
  },
  {
    icon: Lock,
    iconColor: colors.primary,
    title: 'Escrow Payment',
    desc: 'Your payment is held securely until you confirm the job is done right.',
  },
  {
    icon: Shield,
    iconColor: colors.primary,
    title: 'Damage Protection',
    desc: `Property damage covered up to ${formatPHP(platformConfig.siguradoShieldMaxCoverage)} per incident.`,
  },
  {
    icon: Star,
    iconColor: colors.warning,
    title: 'Quality Guarantee',
    desc: 'Substandard work? Get a full refund or free redo by a different provider.',
  },
];

const HOW_IT_WORKS_STEPS = [
  { number: '1', title: 'Book', desc: 'Choose a service and book a verified provider.' },
  { number: '2', title: 'Pay to Escrow', desc: 'Your payment is held safely — not sent to the provider yet.' },
  { number: '3', title: 'Confirm', desc: 'Review the work and confirm completion.' },
  { number: '4', title: 'Issue?', desc: `File a dispute within ${platformConfig.escrowDisputeWindowHours}h. We resolve it fairly.` },
];

interface CoverageItem {
  type: string;
  description: string;
  maxCoverage: string;
  deductible: string;
}

const WHATS_COVERED: CoverageItem[] = [
  { type: 'No-show', description: 'Provider doesn\'t arrive within 30 min', maxCoverage: 'Full refund', deductible: formatPHP(0) },
  { type: 'Incomplete work', description: 'Provider leaves before job is finished', maxCoverage: 'Full or partial refund', deductible: formatPHP(0) },
  { type: 'Substandard work', description: 'Quality below reasonable standards', maxCoverage: 'Up to 100% refund or free redo', deductible: formatPHP(0) },
  { type: 'Property damage', description: 'Provider damages your property', maxCoverage: `Up to ${formatPHP(platformConfig.siguradoShieldMaxCoverage)}`, deductible: formatPHP(platformConfig.siguradoShieldDeductible) },
  { type: 'Theft', description: 'Items missing after provider visit', maxCoverage: `Up to ${formatPHP(platformConfig.siguradoShieldPropertyDamage)} (police report required)`, deductible: formatPHP(0) },
  { type: 'Personal injury', description: 'Injured due to provider negligence', maxCoverage: `Up to ${formatPHP(platformConfig.siguradoShieldPremiumProtection)} (medical docs required)`, deductible: formatPHP(0) },
];

const WHATS_NOT_COVERED = [
  'Damage to items the provider warned about beforehand',
  'Pre-existing property conditions',
  'Jobs performed off-platform',
  'Customer-directed work that caused the issue',
  'Cosmetic dissatisfaction with subjective quality (e.g., paint color you chose)',
  'Jobs cancelled by you after completion',
  'Tips or gratuities',
];

const FAQ_ITEMS = [
  {
    q: 'How do I file a claim?',
    a: `Go to your booking details and tap "File a Dispute." Select the issue type, describe what happened, and attach photos as evidence. For property damage and theft claims, evidence is required. You must file within ${platformConfig.escrowDisputeWindowHours} hours of job completion.`,
  },
  {
    q: 'How long does it take to resolve?',
    a: `Most disputes are resolved within 48 hours. The provider has ${platformConfig.escrowDisputeWindowHours} hours to respond. If they accept, your refund is processed immediately. If contested, our support team reviews the case and makes a decision within 5 business days.`,
  },
  {
    q: 'Am I covered if I pay the provider directly?',
    a: 'No. SiguradoShield\u2122 only covers bookings made and paid for through the onService app. If you transact directly with a provider outside the platform, you are not protected. Always book through the app to stay covered.',
  },
];

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }, []);

  return (
    <View style={styles.accordionContainer}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.7}>
        <Text style={styles.accordionTitle}>{title}</Text>
        <Text style={styles.accordionChevron}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

export default function SafetyScreen(): React.ReactElement {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buyer Protection</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroShieldWrap}><Shield size={52} color={colors.primary} /></View>
          <Text style={styles.heroTitle}>You're Protected</Text>
          <Text style={styles.heroSubtitle}>
            Every booking includes SiguradoShield™ protection up to {formatPHP(platformConfig.siguradoShieldMaxCoverage)}.
            If anything goes wrong, we make it right.
          </Text>
        </View>

        {/* Coverage Cards */}
        <View style={styles.cardsGrid}>
          {COVERAGE_CARDS.map((card) => {
            const CardIcon = card.icon;
            return (
              <View key={card.title} style={styles.card}>
                <View style={styles.cardIconWrap}><CardIcon size={28} color={card.iconColor} /></View>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardDesc}>{card.desc}</Text>
              </View>
            );
          })}
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.stepper}>
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <View key={step.number} style={styles.stepRow}>
                <View style={styles.stepIndicator}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNumber}>{step.number}</Text>
                  </View>
                  {i < HOW_IT_WORKS_STEPS.length - 1 && <View style={styles.stepLine} />}
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* What's Covered */}
        <Accordion title="What's Covered" defaultOpen>
          {WHATS_COVERED.map((item) => (
            <View key={item.type} style={styles.coverageRow}>
              <View style={styles.coverageHeader}>
                <Text style={styles.coverageType}>{item.type}</Text>
                <Text style={styles.coverageMax}>{item.maxCoverage}</Text>
              </View>
              <Text style={styles.coverageDesc}>{item.description}</Text>
              {item.deductible !== formatPHP(0) && (
                <Text style={styles.coverageDeductible}>Deductible: {item.deductible}</Text>
              )}
            </View>
          ))}
        </Accordion>

        {/* What's NOT Covered */}
        <Accordion title="What's NOT Covered">
          {WHATS_NOT_COVERED.map((item) => (
            <View key={item} style={styles.notCoveredRow}>
              <Text style={styles.notCoveredBullet}>✕</Text>
              <Text style={styles.notCoveredText}>{item}</Text>
            </View>
          ))}
        </Accordion>

        {/* FAQ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {FAQ_ITEMS.map((faq) => (
            <Accordion key={faq.q} title={faq.q}>
              <Text style={styles.faqAnswer}>{faq.a}</Text>
            </Accordion>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => router.push('/(tabs)/bookings')}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaBtnText}>Report an Issue</Text>
        </TouchableOpacity>
        <Text style={styles.ctaHint}>
          Select a booking from your history to file a dispute.
        </Text>

        <Text style={styles.footer}>
          SiguradoShield™ is funded by a portion of every service fee. Coverage details are subject to our Terms of Service.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSpacer: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 60 },

  hero: {
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroShield: { fontSize: 52, marginBottom: spacing.sm },
  heroShieldWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  heroTitle: { ...typography.h1, color: colors.primary, marginBottom: spacing.xs },
  heroSubtitle: {
    ...typography.body,
    color: colors.infoDark,
    textAlign: 'center',
    lineHeight: 22,
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    width: '48%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIcon: { fontSize: 28, marginBottom: spacing.xs },
  cardIconWrap: { marginBottom: spacing.xs, alignItems: 'flex-start' as const },
  cardTitle: { ...typography.h3, color: colors.text, fontSize: 15, marginBottom: 4 },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 17 },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md, fontSize: 19 },

  stepper: { gap: 0 },
  stepRow: { flexDirection: 'row', minHeight: 70 },
  stepIndicator: { alignItems: 'center', width: 40, marginRight: spacing.sm },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { color: colors.white, fontWeight: '700', fontSize: 14 },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  stepContent: { flex: 1, paddingBottom: spacing.md },
  stepTitle: { ...typography.h3, color: colors.text, fontSize: 15 },
  stepDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },

  accordionContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  accordionTitle: { ...typography.h3, color: colors.text, flex: 1, fontSize: 15 },
  accordionChevron: { fontSize: 18, color: colors.textSecondary },
  accordionBody: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },

  coverageRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingVertical: spacing.sm,
  },
  coverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  coverageType: { ...typography.body, fontWeight: '600', color: colors.text },
  coverageMax: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  coverageDesc: { ...typography.bodySmall, color: colors.textSecondary },
  coverageDeductible: { ...typography.caption, color: colors.warning, marginTop: 2 },

  notCoveredRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  notCoveredBullet: { color: colors.error, fontSize: 14, fontWeight: '700', marginTop: 2 },
  notCoveredText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },

  faqAnswer: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  ctaBtn: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ctaBtnText: { ...typography.button, color: colors.white },
  ctaHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  footer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
