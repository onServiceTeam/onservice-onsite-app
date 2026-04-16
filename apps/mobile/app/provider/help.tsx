import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

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
        a: 'When a customer books a service in your area and category, you will receive a notification. Go to the Jobs tab to view available requests and accept them.',
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
        q: 'What is the platform commission?',
        a: 'Commission ranges from 8-15% depending on your tier. New providers start at 12-15%. As you complete more jobs and maintain high ratings, your commission decreases. Pro tier (25+ jobs, 4.5+ rating) pays 10-12%, and Elite tier (100+ jobs, 4.7+ rating) pays 8-10%.',
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
        q: 'Can I respond to a bad review?',
        a: 'Currently, reviews cannot be responded to publicly. If you believe a review is unfair or fraudulent, contact support with your evidence and we will investigate.',
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
          <Text style={styles.heroIcon}>🛠️</Text>
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
            Our provider support team is available Monday to Saturday, 8 AM to 8 PM (PHT).
          </Text>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('mailto:providers@onservice.ph')}
          >
            <Text style={styles.contactBtnIcon}>✉️</Text>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Email Provider Support</Text>
              <Text style={styles.contactBtnValue}>providers@onservice.ph</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('tel:+63281234567')}
          >
            <Text style={styles.contactBtnIcon}>📞</Text>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Call Us</Text>
              <Text style={styles.contactBtnValue}>+63 2 8123 4567</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>onService v1.0.0</Text>
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
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
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
  contactBtnInfo: { flex: 1 },
  contactBtnLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  contactBtnValue: { ...typography.caption, color: colors.secondary },
  versionInfo: { alignItems: 'center', paddingVertical: spacing.xl },
  versionText: { ...typography.caption, color: colors.textTertiary },
});
