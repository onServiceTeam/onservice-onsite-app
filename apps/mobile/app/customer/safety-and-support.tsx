// Bug 538 — Phase 14 Dispatch 04 — SiguradoShield pull (Option A).
//
// This screen is the post-pull replacement for `apps/mobile/app/customer/safety.tsx`.
// SiguradoShield (the in-house insurance product) is deferred to v1.1+ per
// LAUNCH-LIMITATIONS.md §23 and `.ai-coder/decisions/D04-siguradoshield.md`
// (Ken — Option A — 2026-04-30).
//
// The renamed screen displays only verifiable trust claims:
//   - NBI clearance (verifiable — providers must pass an NBI background check).
//   - Server-backed payment and escrow status for supported in-app payments.
//   - Booking status and service-location context.
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
import { useResponsive } from '@/hooks/useResponsive';
import { showToast } from '@/lib/toast';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SAFETY_ITEMS: Array<{ icon: IconComponent; iconColor: string; title: string; desc: string }> = [
  {
    icon: CheckCircle2,
    iconColor: colors.success,
    title: 'Provider document review',
    desc: 'Provider onboarding collects a government ID, selfie identity check, and NBI clearance for platform review. Use the provider profile and booking record to confirm current platform approval.',
  },
  {
    icon: Lock,
    iconColor: colors.primary,
    title: 'Payment and escrow records',
    desc: 'For supported in-app payments, the booking shows whether payment is verified and escrow is currently held. Release can follow confirmation or the platform completion timer.',
  },
      {
        icon: MapPin,
        iconColor: colors.primary,
        title: 'Live status updates',
        desc: 'Get push notifications and booking-status tracking as the provider accepts, heads out, and arrives. The map shows the recorded service location, not a live provider pin.',
      },
  {
    icon: MessageSquare,
    iconColor: colors.primary,
    title: 'In-app communication record',
    desc: 'Use booking chat without displaying personal phone numbers to the other participant. The conversation remains attached to the booking for support review.',
  },
];

const TIPS: Array<{ q: string; a: string }> = [
  {
    q: 'What should I do before the provider arrives?',
    a: 'Lock away valuables. If you live alone, consider having a friend or family member with you for the appointment. Keep your phone charged.',
  },
  {
    q: 'What if the provider doesn\'t show up?',
    a: 'Tap "Cancel booking" on the booking detail and review the recorded cancellation outcome. A refund is confirmed only when the booking shows its method, destination, status, and reference. Report the no-show through support so the provider conduct can be reviewed.',
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
    a: `No. onService PH is a marketplace, not an insurance provider. Platform tools include provider identity and NBI-clearance review, payment and escrow records for supported in-app payments, in-app booking chat, a ${platformConfig.escrowDisputeWindowHours}-hour dispute filing window, and provider accountability review. For loss or damage beyond those tools, please maintain your own homeowner's or renter's insurance. Providers are independent contractors and are responsible for damage they cause; you may pursue them directly and use the platform dispute record.`,
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
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${open ? 'expanded' : 'collapsed'}`}
        accessibilityHint={open ? 'Collapses this safety answer' : 'Expands this safety answer'}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.accordionTitle}>{title}</Text>
        <Text style={styles.accordionChevron}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

export default function SafetyAndSupportScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();

  const handleEmergencyCall = useCallback(() => {
    if (Platform.OS === 'web') {
      showToast('For immediate danger, call 911 from your phone.', 'error');
      return;
    }

    void Linking.openURL('tel:911').catch(() => {
      showToast('For immediate danger, call 911 from your phone.', 'error');
    });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back from safety and support">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety & support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Safety and support' : 'Desktop safety and support workspace'}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroShieldWrap}>
            <CheckCircle2 size={52} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Safety and booking support</Text>
          <Text style={styles.heroSubtitle}>
            Review provider checks, booking records, status updates, and the right support path in one place.
          </Text>
        </View>

        {/* How we keep you safe */}
        <View style={styles.section}>
          <SectionHeader title="Safety tools and records" />
          <View style={styles.cardsGrid}>
            {SAFETY_ITEMS.map((card) => {
              const CardIcon = card.icon;
              return (
                <View key={card.title} style={[styles.card, !isPhone && styles.cardWide]}>
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

          <TouchableOpacity onPress={handleEmergencyCall} style={styles.emergencyButton} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Call 911 for immediate danger">
            <AlertTriangle size={24} color={colors.white} />
            <View style={styles.emergencyTextBlock}>
              <Text style={styles.emergencyTitle}>Call 911</Text>
              <Text style={styles.emergencySubtitle}>If you're in immediate danger</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push(Routes.SUPPORT.INBOX)} style={styles.supportButton} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Open onService support inbox">
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
                safetyConcern: '1',
                subject: 'Safety concern',
                description: 'I need help with a safety concern. ',
              },
            })}
            style={styles.reportButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Report a safety concern"
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
  bodyContentWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: spacing.xl },

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
  cardWide: { width: 'auto', flexBasis: '23%', flexGrow: 1 },
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
