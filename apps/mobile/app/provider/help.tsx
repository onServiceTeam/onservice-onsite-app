import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { Routes } from '@/config/navigation';
import { Wrench, Mail, Phone, MessageSquare, ChevronRight } from '@/components/icons';

const SUPPORT_EMAIL = 'providers@onservice.ph';
const SUPPORT_PHONE = '+63 2 8123 4567';

// Same web-safe contact handling as the customer Help screen: mailto/tel
// blank-paged the web build, so on web we surface the address in a dialog.
function openContact(kind: 'email' | 'call'): void {
  if (Platform.OS === 'web') {
    Alert.alert(
      kind === 'email' ? 'Email provider support' : 'Call support',
      kind === 'email' ? SUPPORT_EMAIL : SUPPORT_PHONE,
    );
    return;
  }
  const url = kind === 'email' ? `mailto:${SUPPORT_EMAIL}` : `tel:${SUPPORT_PHONE.replace(/\s/g, '')}`;
  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open', kind === 'email' ? SUPPORT_EMAIL : SUPPORT_PHONE);
  });
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
        a: 'When a customer books a service in your area and category, a job offer pops up in the app (and as a notification) with about a minute to Accept or Decline. Accept it and the job moves into your Jobs tab under Active. If you miss it, it is offered to the next available provider.',
      },
      {
        q: 'How does the quoting system work?',
        a: 'For custom job requests, you can submit a quote with your proposed price and timeline. The customer reviews all quotes and selects one. Respond quickly for the best chance of being selected.',
      },
      {
        q: 'Can I cancel an accepted job?',
        a: 'Yes, but repeated cancellations affect your rating and may result in temporary suspension. Cancel only if absolutely necessary and contact support if you have a genuine emergency.',
      },
      {
        q: 'How do I manage my availability?',
        a: 'Go to Settings > Manage Schedule to set your weekly availability. You can also block specific dates for holidays or time off.',
      },
    ],
  },
  {
    title: 'Earnings & Payouts',
    items: [
      {
        q: 'When do I get paid?',
        a: 'Payment is released to your wallet after the customer confirms job completion. From there, you can withdraw to GCash, Maya, or your bank account.',
      },
      {
        // BUG-PHASE89-01 fix — pre-fix this answer described commission
        // as ranges per tier (e.g. "Pro pays X to Y percent"). The actual
        // rates in platformConfig.commissionRates are flat per tier (no
        // within-tier variability) and the FAQ also omitted the verified
        // tier entirely. Pre-fix providers reading this would expect their
        // commission to drop within a tier as their rating climbed — it
        // doesn't, only crossing into the next tier changes the rate.
        // Updated to match the live config: flat rates per tier, all
        // five tiers listed, plus a note that founding is invite-only.
        q: 'What is the platform commission?',
        a: 'Commission is a flat percent per tier — it does not move within a tier, only when you cross into the next one. New providers pay 15%. Verified (5+ jobs, 4.0+ rating) pays 13%. Pro (25+ jobs, 4.5+ rating, no open disputes) pays 11%. Elite (100+ jobs, 4.7+ rating, TESDA-certified, no open disputes) pays 9%. Founding-batch providers — invite-only — pay 10%.',
      },
      {
        q: 'How do withdrawals work?',
        a: 'Go to the Earnings tab and tap Withdraw. Enter the amount and select your payout method. Withdrawals are processed within 1-3 business days.',
      },
      {
        q: 'What is a change order?',
        a: 'If you discover additional work is needed during a job, submit a change order with the extra amount. The customer must approve it before you proceed. This protects both parties.',
      },
    ],
  },
  {
    title: 'Ratings & Reviews',
    items: [
      {
        q: 'How are ratings calculated?',
        a: 'Your overall rating is the average of all customer reviews. Only completed bookings can be reviewed. Ratings are visible to customers when they browse providers.',
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
        a: 'Suki builds customer loyalty. Repeat customers are more reliable, leave better reviews, and provide steady income. You can view your repeat customers in the Suki Customers section.',
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
        a: 'Go to Settings > Manage Services to add or remove service categories, update your pricing, and adjust your service descriptions.',
      },
    ],
  },
];

export default function ProviderHelpScreen(): React.ReactElement {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleFAQ = (key: string): void => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
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
            Our provider support team is available Monday to Saturday, 8 AM to 8 PM (PHT). Messaging in the app is the fastest way to get help on a job.
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
            onPress={() => openContact('email')}
            accessibilityRole="button"
            accessibilityLabel={`Email provider support at ${SUPPORT_EMAIL}`}
          >
            <View style={styles.contactBtnIconWrap}><Mail size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Email provider support</Text>
              <Text style={styles.contactBtnValue}>{SUPPORT_EMAIL}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => openContact('call')}
            accessibilityRole="button"
            accessibilityLabel={`Call support at ${SUPPORT_PHONE}`}
          >
            <View style={styles.contactBtnIconWrap}><Phone size={22} color={colors.primary} /></View>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Call us</Text>
              <Text style={styles.contactBtnValue}>{SUPPORT_PHONE}</Text>
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
