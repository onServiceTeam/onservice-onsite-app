import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { SectionHeader } from '@/components/ui';
import { Mail, MessageSquare, ChevronLeft, ChevronRight } from '@/components/icons';
import { showToast } from '@/lib/toast';

const SUPPORT_EMAIL = 'support@onservice.ph';

// Bug (Jenico feedback): on the web build, Linking.openURL('mailto:…')
// navigated the whole tab to a blank page. On web we surface the
// address in a non-blocking message the user can copy instead; native still deep-links.
function openEmail(): void {
  if (Platform.OS === 'web') { showToast(`Email support at ${SUPPORT_EMAIL}`, 'info'); return; }
  Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => { showToast(`Email support at ${SUPPORT_EMAIL}`, 'info'); });
}
import { fetchCancellationPolicy, policyToHelpAnswer } from '@/utils/cancellation-policy';
import { platformConfig } from '@/config/platform.config';
import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';

interface FAQItem {
  q: string;
  a: string;
}

const FAQ_SECTIONS: { title: string; items: FAQItem[] }[] = [
  {
    title: 'Booking & Services',
    items: [
      {
        q: 'How do I book a service?',
        a: 'Browse service categories on the home screen, select the service you need, choose a date/time, pick your address, and proceed to checkout. You can also submit a custom job request if your needs are unique.',
      },
      {
        // Bug 1170/1198 fix: substituted at render time with the live policy.
        q: 'Can I cancel a booking?',
        a: 'Loading current cancellation policy…',
      },
      {
        q: 'How does the quoting system work?',
        a: 'For custom job requests, nearby providers will send you quotes. You can compare quotes, view provider ratings, and accept the best one. When checkout succeeds and the booking shows paid and held, the payment is in escrow until the booking reaches its confirmed settlement step.',
      },
      {
        q: 'What is a change order?',
        a: 'If the provider discovers additional work is needed during a job, they can submit a change order with the extra amount. You must approve it before they proceed with the additional work.',
      },
      {
        q: 'What if the job needs extra parts or materials?',
        a: 'If a job needs extra parts or materials, the provider sends you a change order in the app (or a custom quote up front) with the added cost. You review and approve it in the app before any extra work or spend happens. Nothing extra is charged until you approve, and the scope, amount, and payment state stay in the booking record.',
      },
    ],
  },
  {
    title: 'Payments & Refunds',
    items: [
      {
        q: 'What payment methods are accepted?',
        a: 'An existing onService wallet balance is currently available where checkout offers it. New card, GCash, Maya, QR Ph, bank-transfer, and wallet top-up authorization is temporarily disabled while that payment flow is corrected.',
      },
      {
        q: 'How does escrow work?',
        a: 'After a supported in-app payment succeeds, the booking shows its paid and escrow status. Release can follow your completion confirmation or the platform completion timer. Use the booking record for the current state; filing a case does not by itself prove funds remain held.',
      },
      {
        q: 'How do I get a refund?',
        a: `Cancellation outcomes follow the policy shown in the app. For a service dispute, file from the completed booking within ${platformConfig.escrowDisputeWindowHours} hours and follow its case status. Support records the decision and any approved refund; timing depends on the payment and escrow state, so the app does not promise a fixed 1–3 day result.`,
      },
    ],
  },
  {
    // Bug 686 \u2014 Phase 14 D04 SiguradoShield pull. The "SiguradoShield\u2122
    // Protection" FAQ section has been removed. The vetting question moves
    // into the new "Safety & support" section. The "Does the platform provide
    // insurance?" question awaits Ken's exact disclaimer wording per
    // .ai-coder/decisions/D04-siguradoshield.md \u00a7legal-language.
    title: 'Safety & support',
    items: [
      {
        q: 'Are providers background-checked?',
        a: 'Providers must submit a government ID, selfie identity check, and NBI clearance for platform review. Approval and document-expiry status are recorded in onService. This does not mean a new background check is run before every booking.',
      },
      // Phase 14 Remediation #10 (partial). Interim wording \u2014 pending
      // attorney review.
      {
        q: 'Does the platform provide insurance?',
        a: `No. onService PH is a marketplace, not an insurance provider. Platform tools include NBI and identity review, payment and escrow records, in-app booking chat, a ${platformConfig.escrowDisputeWindowHours}-hour dispute filing window, and provider accountability review. For loss or damage beyond those tools, please maintain your own homeowner's or renter's insurance. Providers are independent contractors and are responsible for damage they cause.`,
      },
    ],
  },
  {
    title: 'Account & Privacy',
    items: [
      {
        q: 'How do I update my profile?',
        a: 'Open the Profile tab and choose Edit Profile to update your name. For a verified phone-number change, use the account-support link in Edit Profile so support can verify the request. The current app does not offer email or profile-photo editing.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Open Account & Data from your profile to request deactivation and anonymization. There is a 30-day cooling-off period during which you can cancel. After that, your account and public profile are deactivated and personal identifiers are anonymized. Booking, payment, dispute, tax, and compliance records may be retained where required.',
      },
    ],
  },
];

export default function HelpScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Bug 1170/1198 fix: substitute the cancel-booking FAQ answer with the
  // live policy. 5-minute staleTime mirrors the server cache.
  const policyQuery = useQuery({
    queryKey: ['cancellation-policy'],
    queryFn: fetchCancellationPolicy,
    staleTime: 5 * 60_000,
  });

  const sections = useMemo(() => {
    if (!policyQuery.data) {
      if (!policyQuery.isError) return FAQ_SECTIONS;
      return FAQ_SECTIONS.map((section) =>
        section.title === 'Booking & Services'
          ? {
              ...section,
              items: section.items.map((item) =>
                item.q === 'Can I cancel a booking?'
                  ? {
                      ...item,
                      a: 'The current cancellation policy could not be loaded. Retry before relying on refund or fee information, and check the policy recorded on your booking.',
                    }
                  : item,
                ),
            }
          : section,
      );
    }
    return FAQ_SECTIONS.map((section) =>
      section.title === 'Booking & Services'
        ? {
            ...section,
            items: section.items.map((item) =>
              item.q === 'Can I cancel a booking?'
                ? { ...item, a: policyToHelpAnswer(policyQuery.data) }
                : item,
            ),
          }
        : section,
    );
  }, [policyQuery.data, policyQuery.isError]);

  const toggleFAQ = (key: string): void => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back from help and support" onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Customer help' : 'Desktop customer help workspace'}
      >
        <View style={styles.heroCard}>
          <MessageSquare size={40} color={colors.primary} style={{ marginBottom: spacing.md }} />
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>
            Browse frequently asked questions or contact our support team.
          </Text>
        </View>

        {policyQuery.isError && (
          <View style={styles.policyError} accessibilityRole="alert">
            <Text style={styles.policyErrorText}>
              Current cancellation terms are unavailable. Retry before relying on cancellation or refund guidance.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry cancellation policy"
              style={styles.policyRetry}
              onPress={() => void policyQuery.refetch()}
            >
              <Text style={styles.policyRetryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BUG-PHASE57-02 fix — pre-fix this map used the constant
             FAQ_SECTIONS instead of the `sections` memo above (line
             102) that performs the live-policy substitution. The
             "Can I cancel a booking?" answer was permanently stuck
             showing "Loading current cancellation policy…" because
             the patched data was computed and discarded. Phase 14
             D02 Bug 1170/1198 added the patcher but missed wiring
             it through to render. */}
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <SectionHeader title={section.title} />
            {section.items.map((item, i) => {
              const key = `${section.title}-${i}`;
              const isOpen = expanded === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.faqItem}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.q}, ${isOpen ? 'expanded' : 'collapsed'}`}
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => toggleFAQ(key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqQuestion}>{item.q}</Text>
                    <Text style={styles.faqChevron}>{isOpen ? '▲' : '▼'}</Text>
                  </View>
                  {isOpen && <Text style={styles.faqAnswer}>{item.a}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactSubtitle}>
            Our support team is available Monday to Saturday, 8 AM to 6 PM (PHT). Messaging us in the app is the fastest way to get help, and it keeps a record tied to your booking.
          </Text>

          <TouchableOpacity
            style={[styles.contactBtn, styles.contactBtnPrimary]}
            onPress={() => router.push(Routes.SUPPORT.INBOX)}
            accessibilityRole="button"
            accessibilityLabel="Message support in the app"
          >
            <View style={styles.contactBtnIconWrap}><MessageSquare size={22} color={colors.white} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={[styles.contactBtnLabel, styles.contactBtnLabelOnPrimary]}>Message support</Text>
              <Text style={[styles.contactBtnValue, styles.contactBtnValueOnPrimary]}>Chat with our team in the app</Text>
            </View>
            <ChevronRight size={20} color={colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => openEmail()}
            accessibilityRole="button"
            accessibilityLabel={`Email support at ${SUPPORT_EMAIL}`}
          >
            <View style={styles.contactBtnIconWrap}><Mail size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Email support</Text>
              <Text style={styles.contactBtnValue}>{SUPPORT_EMAIL}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* BUG-PHASE102-01 fix — pre-fix this row hardcoded a
             version string that disagreed with (tabs)/profile.tsx,
             which displayed the real platformConfig.appVersion. Two
             different version strings inside the same app made it
             impossible to tell which build a user was actually
             running. Source-of-truth is platformConfig (which mirrors
             package.json); the help footer now reads from it. */}
        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>onService v{platformConfig.appVersion}</Text>
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base },
  bodyContentWide: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: spacing.xl },
  heroCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.base,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  heroIcon: { fontSize: 40, marginBottom: spacing.sm },
  heroTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  policyError: { backgroundColor: colors.errorLight, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg },
  policyErrorText: { ...typography.bodySmall, color: colors.error, lineHeight: 20 },
  policyRetry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: spacing.xs },
  policyRetryText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  faqItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  faqQuestion: { ...typography.body, fontWeight: '600', color: colors.text, flex: 1, marginRight: spacing.sm },
  faqChevron: { fontSize: 12, color: colors.textTertiary, marginTop: 3 },
  faqAnswer: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  contactSection: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  contactTitle: { ...typography.h3, color: colors.infoDark, marginBottom: spacing.xs },
  contactSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.base, lineHeight: 20 },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  contactBtnIcon: { fontSize: 22, marginRight: spacing.base },
  contactBtnIconWrap: { marginRight: spacing.base, width: 28, alignItems: 'center' as const },
  contactBtnInfo: { flex: 1 },
  contactBtnLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  contactBtnValue: { ...typography.caption, color: colors.primary },
  contactBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  contactBtnLabelOnPrimary: { color: colors.white },
  contactBtnValueOnPrimary: { color: 'rgba(255,255,255,0.85)' },
  versionInfo: { alignItems: 'center', paddingVertical: spacing.xl },
  versionText: { ...typography.caption, color: colors.textTertiary },
});
