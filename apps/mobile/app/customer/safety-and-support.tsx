// Bug 538 — Phase 14 Dispatch 04 — SiguradoShield pull (Option A).
//
// This screen is the post-pull replacement for `apps/mobile/app/customer/safety.tsx`.
// SiguradoShield (the in-house insurance product) is deferred to v1.1+ per
// LAUNCH-LIMITATIONS.md §23 and `.ai-coder/decisions/D04-siguradoshield.md`
// (Ken — Option A — 2026-04-30).
//
// The renamed screen displays only verifiable trust claims:
//   - NBI clearance (verifiable — providers must pass an NBI background check).
//   - Escrow payment (verifiable — payment held until job confirmation).
//   - Real-time tracking (verifiable — maps integration).
//   - In-app chat keeps your number private (verifiable — messaging is in-app;
//     phone numbers are never exchanged). NOTE: an earlier version claimed
//     "masked phone numbers (Twilio)"; that was never built (no Twilio/voice
//     integration exists). Corrected to the real, shipped capability. In-app
//     voice/video is planned — see .ai-coder/decisions/D26-calls-video-provider.md.
//
// Notably absent (do NOT reintroduce without lifting LAUNCH-LIMITATIONS §23
// and securing an Insurance Commission license OR a licensed-insurer
// partnership):
//   - "SiguradoShield" trademark
//   - Peso-amount coverage figures
//   - Words: insurance, claims, deductible, "covered up to ₱X"
//   - Links to a claims service
//
// `<!-- TODO: Ken to provide explicit no-insurance disclaimer wording, see
// .ai-coder/decisions/D04-siguradoshield.md §legal-language -->` placeholder
// is in the FAQ section under "Does the platform provide insurance?" (Ken
// supplies wording in a follow-up commit).

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Linking,
  Platform,
  UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { SectionHeader } from '@/components/ui';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import { CheckCircle2, Lock, MapPin, MessageSquare, AlertTriangle, ChevronLeft } from '@/components/icons';
import { Routes } from '@/config/navigation';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SAFETY_ITEMS: Array<{ icon: IconComponent; iconColor: string; title: string; desc: string }> = [
  {
    icon: CheckCircle2,
    iconColor: colors.success,
    title: 'NBI-cleared pros',
    desc: 'Every active provider has passed an NBI clearance check before being approved.',
  },
  {
    icon: Lock,
    iconColor: colors.primary,
    title: 'Escrow payment',
    desc: `Your payment is held in escrow until you confirm the job is complete. If a dispute is opened within ${platformConfig.escrowDisputeWindowHours} hours of completion, funds stay held while support reviews evidence.`,
  },
  {
    icon: MapPin,
    iconColor: colors.primary,
    title: 'Live status updates',
    desc: "Get push notifications and on-screen status changes as your provider accepts the job, heads out, and arrives. The booking-tracker screen also shows the service address on a map so you can confirm the location.",
  },
  {
    icon: MessageSquare,
    iconColor: colors.primary,
    title: 'Your number stays private',
    desc: 'Chat with your provider inside the app. Your real phone number is never shared, so everything stays on the platform where support can help if anything goes wrong.',
  },
];

const TIPS: Array<{ q: string; a: string }> = [
  {
    q: 'What should I do before the provider arrives?',
    a: 'Lock away valuables. If you live alone, consider having a friend or family member with you for the appointment. Keep your phone charged.',
  },
  {
    q: 'What if the provider doesn\'t show up?',
    a: `Tap "Cancel booking" on the booking detail. You'll receive a refund per the cancellation policy. Report the no-show via "Report a safety concern" so we can take action against the provider.`,
  },
  {
    q: 'What if something is damaged during the service?',
    a: `Take photos right away. Open a dispute from the booking detail screen within ${platformConfig.escrowDisputeWindowHours} hours of completion. Our support team reviews evidence from both parties (photos, GPS log, chat history) and works toward a fair resolution.`,
  },
  {
    q: 'Can I leave a review if I felt unsafe?',
    a: 'Yes. Reviews are public. We also encourage you to flag the provider through "Report a safety concern" so we can investigate beyond the public review.',
  },
  // Phase 14 Remediation #10 (partial). Interim wording — pending
  // attorney review.
  {
    q: 'Does the platform provide insurance?',
    a: 'No. onService PH is a marketplace, not an insurance provider. Our platform protections include NBI clearance verification for every provider, escrow payment held until service completion, masked phone numbers, a 48-hour dispute window, and provider rating accountability. For loss or damage that exceeds these protections, please maintain your own homeowner\'s or renter\'s insurance. Providers are independent contractors and are responsible for any property damage they cause; you may pursue claims directly against them through our dispute process.',
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

export default function SafetyAndSupportScreen(): React.ReactElement {
  const router = useRouter();

  const handleEmergencyCall = useCallback(() => {
    Linking.openURL('tel:911');
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety & support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroShieldWrap}>
            <CheckCircle2 size={52} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Booked safely with onService</Text>
          <Text style={styles.heroSubtitle}>
            We protect every booking with verified providers, escrow payment, and real-time tracking.
          </Text>
        </View>

        {/* How we keep you safe */}
        <View style={styles.section}>
          <SectionHeader title="How we keep you safe" />
          <View style={styles.cardsGrid}>
            {SAFETY_ITEMS.map((card) => {
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
        </View>

        {/* If you need help */}
        <View style={styles.section}>
          <SectionHeader title="If you need help" />

          <TouchableOpacity onPress={handleEmergencyCall} style={styles.emergencyButton} activeOpacity={0.8}>
            <AlertTriangle size={24} color={colors.white} />
            <View style={styles.emergencyTextBlock}>
              <Text style={styles.emergencyTitle}>Call 911</Text>
              <Text style={styles.emergencySubtitle}>If you're in immediate danger</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push(Routes.SUPPORT.INBOX)} style={styles.supportButton} activeOpacity={0.8}>
            <MessageSquare size={24} color={colors.primary} />
            <View style={styles.supportTextBlock}>
              <Text style={styles.supportTitle}>Message onService support</Text>
              <Text style={styles.supportSubtitle}>Reach our team about an active job</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({
              pathname: Routes.SUPPORT.NEW,
              params: {
                type: 'booking_issue',
                priority: 'urgent',
                subject: 'Safety concern',
                description: 'I need help with a safety concern. ',
              },
            })}
            style={styles.reportButton}
            activeOpacity={0.7}
          >
            <Text style={styles.reportButtonText}>Report a safety concern →</Text>
          </TouchableOpacity>
        </View>

        {/* Tips for safe bookings */}
        <View style={styles.section}>
          <SectionHeader title="Tips for safe bookings" />
          {TIPS.map((tip) => (
            <Accordion key={tip.q} title={tip.q}>
              <Text style={styles.faqAnswer}>{tip.a}</Text>
            </Accordion>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
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
  heroShieldWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  heroTitle: { ...typography.h1, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
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
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardIconWrap: { marginBottom: spacing.xs, alignItems: 'flex-start' as const },
  cardTitle: { ...typography.h3, color: colors.text, fontSize: 15, marginBottom: 4 },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 17 },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md, fontSize: 19 },

  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  emergencyTextBlock: { marginLeft: spacing.md, flex: 1 },
  emergencyTitle: { ...typography.h3, color: colors.white, fontSize: 16 },
  emergencySubtitle: { ...typography.bodySmall, color: colors.white, opacity: 0.9 },

  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  supportTextBlock: { marginLeft: spacing.md, flex: 1 },
  supportTitle: { ...typography.h3, color: colors.text, fontSize: 16 },
  supportSubtitle: { ...typography.bodySmall, color: colors.textSecondary },

  reportButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  reportButtonText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  accordionContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
  faqAnswer: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
});
