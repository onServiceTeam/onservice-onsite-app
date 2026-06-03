import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Mail, Phone, MessageSquare, ChevronLeft } from '@/components/icons';
import { fetchCancellationPolicy, policyToHelpAnswer } from '@/utils/cancellation-policy';
import { platformConfig } from '@/config/platform.config';

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
        a: 'For custom job requests, nearby providers will send you quotes. You can compare quotes, view provider ratings, and accept the best one. Payment is held in escrow until the job is confirmed complete.',
      },
      {
        q: 'What is a change order?',
        a: 'If the provider discovers additional work is needed during a job, they can submit a change order with the extra amount. You must approve it before they proceed with the additional work.',
      },
    ],
  },
  {
    title: 'Payments & Refunds',
    items: [
      {
        q: 'What payment methods are accepted?',
        a: 'We accept GCash, Maya, credit/debit cards, QRPH bank transfers, and wallet balance. All payments are secured through our escrow system.',
      },
      {
        q: 'How does escrow work?',
        a: 'When you pay for a booking, the funds are held in escrow (not released to the provider). Once you confirm the job is complete, the payment is released to the provider minus the platform commission.',
      },
      {
        q: 'How do I get a refund?',
        a: 'Refunds are processed automatically based on our cancellation policy. For disputes, you can file a complaint within 48 hours of job completion. Refunds are credited to your wallet within 1-3 business days.',
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
        a: 'Yes. All providers must submit a valid government ID and NBI clearance. We verify their identity through selfie matching and ongoing background checks.',
      },
      // Phase 14 Remediation #10 (partial). Interim wording \u2014 pending
      // attorney review.
      {
        q: 'Does the platform provide insurance?',
        a: 'No. onService PH is a marketplace, not an insurance provider. Our platform protections (NBI verification, escrow payment, 48-hour dispute window, masked phone numbers, provider rating accountability) are listed in the Safety & support screen. For loss or damage beyond these protections, please maintain your own homeowner\'s or renter\'s insurance. Providers are independent contractors and are responsible for any property damage they cause.',
      },
    ],
  },
  {
    title: 'Account & Privacy',
    items: [
      {
        q: 'How do I update my profile?',
        a: 'Go to the Profile tab and tap on your name or photo to edit your details. You can update your display name, email, and profile photo.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Contact our support team to request account deletion. There is a 30-day cooling period during which you can reactivate your account. After 30 days, all data is permanently deleted.',
      },
    ],
  },
];

export default function HelpScreen(): React.ReactElement {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Bug 1170/1198 fix: substitute the cancel-booking FAQ answer with the
  // live policy. 5-minute staleTime mirrors the server cache.
  const policyQuery = useQuery({
    queryKey: ['cancellation-policy'],
    queryFn: fetchCancellationPolicy,
    staleTime: 5 * 60_000,
  });

  const sections = useMemo(() => {
    if (!policyQuery.data) return FAQ_SECTIONS;
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
  }, [policyQuery.data]);

  const toggleFAQ = (key: string): void => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <MessageSquare size={40} color={colors.primary} style={{ marginBottom: spacing.md }} />
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>
            Browse frequently asked questions or contact our support team.
          </Text>
        </View>

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
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, i) => {
              const key = `${section.title}-${i}`;
              const isOpen = expanded === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.faqItem}
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
            Our support team is available Monday to Saturday, 8 AM to 8 PM (PHT).
          </Text>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('mailto:support@onservice.ph')}
          >
            <View style={styles.contactBtnIconWrap}><Mail size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Email Support</Text>
              <Text style={styles.contactBtnValue}>support@onservice.ph</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('tel:+63281234567')}
          >
            <View style={styles.contactBtnIconWrap}><Phone size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Call Us</Text>
              <Text style={styles.contactBtnValue}>+63 2 8123 4567</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1, paddingHorizontal: spacing.base },
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
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  faqItem: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
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
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactBtnIcon: { fontSize: 22, marginRight: spacing.base },
  contactBtnIconWrap: { marginRight: spacing.base, width: 28, alignItems: 'center' as const },
  contactBtnInfo: { flex: 1 },
  contactBtnLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  contactBtnValue: { ...typography.caption, color: colors.primary },
  versionInfo: { alignItems: 'center', paddingVertical: spacing.xl },
  versionText: { ...typography.caption, color: colors.textTertiary },
});
