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
    title: 'Booking & Services',
    items: [
      {
        q: 'How do I book a service?',
        a: 'Browse service categories on the home screen, select the service you need, choose a date/time, pick your address, and proceed to checkout. You can also submit a custom job request if your needs are unique.',
      },
      {
        q: 'Can I cancel a booking?',
        a: 'Yes. Cancel for free up to 2 hours before the scheduled time. Cancellations within 2 hours incur a 20% fee. If the provider has already arrived, a 50% fee applies.',
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
    title: 'SiguradoShield\u2122 Protection',
    items: [
      {
        q: 'What is SiguradoShield\u2122?',
        a: 'SiguradoShield\u2122 is our comprehensive protection program. It includes escrow payment protection, NBI-verified providers, a service quality guarantee, and a 48-hour dispute window.',
      },
      {
        q: 'Are providers background-checked?',
        a: 'Yes. All providers must submit a valid government ID and NBI clearance. We verify their identity through selfie matching and ongoing background checks.',
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
          <Text style={styles.heroIcon}>💬</Text>
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>
            Browse frequently asked questions or contact our support team.
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
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactSubtitle}>
            Our support team is available Monday to Saturday, 8 AM to 8 PM (PHT).
          </Text>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('mailto:support@onservice.ph')}
          >
            <Text style={styles.contactBtnIcon}>✉️</Text>
            <View style={styles.contactBtnInfo}>
              <Text style={styles.contactBtnLabel}>Email Support</Text>
              <Text style={styles.contactBtnValue}>support@onservice.ph</Text>
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
  contactBtnValue: { ...typography.caption, color: colors.primary },
  versionInfo: { alignItems: 'center', paddingVertical: spacing.xl },
  versionText: { ...typography.caption, color: colors.textTertiary },
});
