import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { Routes } from '@/config/navigation';
import { Wrench, Mail, MessageSquare, ChevronRight } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

const SUPPORT_EMAIL = 'providers@onservice.ph';

// Same web-safe contact handling as the customer Help screen: mailto
// blank-paged the web build, so on web we surface the address in a dialog.
function openEmail(): void {
  if (Platform.OS === 'web') { Alert.alert('Email provider support', SUPPORT_EMAIL); return; }
  Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => { Alert.alert('Could not open', SUPPORT_EMAIL); });
}

interface FAQItem {
  q: string;
  a: string;
}

const FAQ_SECTIONS: { title: string; items: FAQItem[] }[] = [
  {
    title: 'Jobs & Scheduling',
    items: [
      {
        q: 'How do I receive job requests?',
        a: 'When a matching request is offered to you, the app shows the live acceptance countdown. A device alert is also attempted when you have that channel enabled. Accepting assigns the work and moves it into Jobs; an expired offer can move to another eligible provider.',
      },
      {
        q: 'How does the quoting system work?',
        a: 'For custom job requests, you can submit a quote with your proposed price and timeline. The customer reviews all quotes and selects one. Respond quickly for the best chance of being selected.',
      },
      {
        q: 'Can I cancel an accepted job?',
        a: 'Use the job cancellation action when it is available and give the exact reason. Repeated provider cancellations can affect account standing and may be reviewed under the provider standards. Contact support when an emergency or safety issue prevents the work.',
      },
      {
        q: 'How do I manage my availability?',
        a: 'Go to Settings > Weekly Schedule to set your weekly availability. You can also block specific dates for holidays or time off.',
      },
    ],
  },
  {
    title: 'Earnings & Payouts',
    items: [
      {
        q: 'When do I get paid?',
        a: 'For a booking that shows paid and held, release follows customer confirmation or the platform completion timer. The resulting balance appears in Earnings. Withdrawal requests are manual and remain under review until the app records a completed transfer.',
      },
      {
        // Bug UX-368 — commission is an admin-controlled live value. Help
        // points to Tier Progression and Earnings instead of maintaining a
        // second table that can drift from the provider's recorded rate.
        q: 'What is the platform commission?',
        a: 'Commission is a tier-specific rate. It does not move within a tier, only when your recorded tier changes. Open Tier Progression or your Earnings breakdown to see the current live rate and the signals used for tier review; this Help page does not keep a second hardcoded rate table.',
      },
      {
        q: 'How do withdrawals work?',
        a: 'Go to Earnings and tap Withdraw. Enter the amount and destination, then track the request status in the app. Requests are reviewed manually; large requests may enter an internal risk review. Treat a withdrawal as sent only when its status and transfer reference are recorded.',
      },
      {
        q: 'What is a change order?',
        a: 'If you discover additional work during a job, submit a change order with the reason and itemized amount. Continue with that extra work only after the customer approves it and the booking records the added charge as paid and held.',
      },
      {
        q: 'How do I charge for extra parts or materials?',
        a: 'If a job needs extra parts or materials, send a change order in the app (or a custom quote up front) before you buy or do extra work. The customer must approve it. Continue only when the booking shows the added charge as paid and held; a pending approval is not payment. Never collect off-platform or in cash because that work would not be in the support record.',
      },
    ],
  },
  {
    title: 'Ratings & Reviews',
    items: [
      {
        q: 'How are ratings calculated?',
        a: 'Your displayed rating is based on visible customer reviews from completed bookings. Reviews hidden after support review are excluded from the public and provider-facing average.',
      },
      {
        // BUG-PHASE61-02 fix — pre-fix this answer said "Currently,
        // reviews cannot be responded to publicly" but the Reviews
        // screen DOES support provider responses (Reply to Review →
        // POST /reviews/:id/response, min 20 chars). The FAQ was
        // misinforming providers and discouraging them from using a
        // shipped feature. Now: matches the actual capability.
        q: 'Can I respond to a bad review?',
        a: 'Yes. Open My Reviews from your profile, find the review, and tap "Reply to Review". Your response is public, capped at 500 characters, and posts immediately. If you believe a review is unfair or fraudulent (e.g. it violates policy, contains a fabricated claim, or is from a customer you never served), contact support with your evidence and we will investigate.',
      },
    ],
  },
  {
    title: 'Suki Loyalty Program',
    items: [
      {
        q: 'What is the Suki program?',
        a: 'The Suki program rewards repeat customers. When a customer books you multiple times, they earn points and tier upgrades. Higher-tier customers get discounts, encouraging them to keep booking you.',
      },
      {
        q: 'How do I benefit from Suki?',
        a: 'Suki Customers keeps repeat-booking history and relationship details visible inside the app. Use that workspace to open the customer record and follow up through the supported provider tools; it does not promise future jobs or ratings.',
      },
    ],
  },
  {
    title: 'Account & Verification',
    items: [
      {
        q: 'What documents do I need?',
        a: 'You need a valid government ID (national ID, drivers license, passport, or UMID) and an NBI clearance. A selfie for identity verification is also required during onboarding.',
      },
      {
        q: 'How do I update my services?',
        a: 'Go to Settings > Manage Services to add or remove services from the live onService catalog. Customer prices and published scope come from the catalog, so this screen does not let an individual provider override them.',
      },
    ],
  },
];

export default function ProviderHelpScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleFAQ = (key: string): void => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Provider help' : 'Desktop provider help workspace'}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}><Wrench size={36} color={colors.primary} /></View>
          <Text style={styles.heroTitle}>Provider Support</Text>
          <Text style={styles.heroSubtitle}>
            Find answers to common questions about jobs, earnings, and your provider account.
          </Text>
        </View>

        {FAQ_SECTIONS.map((section) => (
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
                  accessibilityRole="button"
                  accessibilityLabel={item.q}
                  accessibilityState={{ expanded: isOpen }}
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
          <Text style={styles.contactTitle}>Need more help?</Text>
          <Text style={styles.contactSubtitle}>
            Our provider support team is available Monday to Saturday, 8 AM to 6 PM (PHT). Messaging in the app is the fastest way to get help on a job.
          </Text>

          <TouchableOpacity
            style={[styles.contactBtn, styles.contactBtnPrimary]}
            onPress={() => router.push(Routes.SUPPORT.INBOX)}
            accessibilityRole="button"
            accessibilityLabel="Message provider support in the app"
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
            onPress={() => router.push(Routes.PROVIDER.STANDARDS)}
            accessibilityRole="button"
            accessibilityLabel="Read the provider standards and guidelines"
          >
            <View style={styles.contactBtnIconWrap}><Wrench size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Provider standards</Text>
              <Text style={styles.contactBtnValue}>Quality, conduct, and how your standing works</Text>
            </View>
            <ChevronRight size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => openEmail()}
            accessibilityRole="button"
            accessibilityLabel={`Email provider support at ${SUPPORT_EMAIL}`}
          >
            <View style={styles.contactBtnIconWrap}><Mail size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Email provider support</Text>
              <Text style={styles.contactBtnValue}>{SUPPORT_EMAIL}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* BUG-PHASE102-01 fix — match platformConfig.appVersion so
             this footer never disagrees with (tabs)/profile.tsx or
             the (provider-tabs) profile screen. */}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  heroIconWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  heroTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  contactBtnIcon: { fontSize: 22, marginRight: spacing.base },
  contactBtnIconWrap: { marginRight: spacing.base, alignItems: 'center' as const },
  contactBtnInfo: { flex: 1 },
  contactBtnLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  contactBtnValue: { ...typography.caption, color: colors.secondary },
  contactBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  contactBtnLabelOnPrimary: { color: colors.white },
  contactBtnValueOnPrimary: { color: 'rgba(255,255,255,0.85)' },
  versionInfo: { alignItems: 'center', paddingVertical: spacing.xl },
  versionText: { ...typography.caption, color: colors.textTertiary },
});
