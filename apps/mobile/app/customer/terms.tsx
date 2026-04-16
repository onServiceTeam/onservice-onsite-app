import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface Section {
  title: string;
  content: string;
}

const TOS_SECTIONS: Section[] = [
  {
    title: '1. Acceptance of Terms',
    content:
      'By downloading, accessing, or using the onService platform, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, do not use the platform.',
  },
  {
    title: '2. Platform Services',
    content:
      'onService is a marketplace connecting customers with independent service providers for home and commercial services. We are not a service provider. All services are performed by independent contractors.',
  },
  {
    title: '3. Escrow Payment System',
    content:
      'All payments are held in escrow until the customer confirms satisfactory completion or the 48-hour auto-confirmation window expires. No cash transactions are permitted through the platform.',
  },
  {
    title: '4. Cancellation & Refund Policy',
    content:
      '24+ hours before: Full refund. 12-24 hours: 90% refund. 2-12 hours: 75% refund. Under 2 hours: 50% refund. After provider arrival: No refund (provider receives compensation).',
  },
  {
    title: '5. Dispute Resolution',
    content:
      'Customers have 48 hours after job completion to file a dispute. Disputes are resolved through our tiered system: automated resolution, mediation, and admin arbitration. The platform defaults to protecting the customer when evidence is ambiguous.',
  },
  {
    title: '6. SiguradoShield Protection',
    content:
      'Every booking includes buyer protection up to ₱25,000 for property damage, coverage for no-shows and incomplete work, and a quality guarantee.',
  },
  {
    title: '7. User Conduct',
    content:
      'Users must not attempt to circumvent the platform for direct payment, misrepresent their identity, or engage in fraudulent activity. Violations may result in account suspension.',
  },
  {
    title: '8. Data Privacy (DPA Compliance)',
    content:
      'We collect and process personal data in accordance with Republic Act No. 10173 (Data Privacy Act of 2012). Your data is used solely for platform operations and is never sold to third parties.',
  },
];

const PRIVACY_SECTIONS: Section[] = [
  {
    title: 'What We Collect',
    content:
      'Name, phone number, email (optional), addresses, booking history, payment information (tokenized, never stored raw), device information, and location data (when using the app).',
  },
  {
    title: 'How We Use Your Data',
    content:
      'To provide and improve our services, process payments, match you with providers, resolve disputes, send notifications, and comply with legal obligations.',
  },
  {
    title: 'Data Sharing',
    content:
      'We share limited data with: service providers (your name, address, and booking details for the job), payment processors (PayMongo), and law enforcement (when legally required).',
  },
  {
    title: 'Data Retention',
    content:
      'Active account data is retained while your account exists. After account deletion, data is anonymized within 30 days except where retention is required by Philippine law (e.g., financial records for 10 years per BIR requirements).',
  },
  {
    title: 'Your Rights',
    content:
      'Under the Data Privacy Act, you have the right to: access your data, correct inaccurate data, erase your data (subject to legal retention requirements), object to processing, and data portability.',
  },
  {
    title: 'National Privacy Commission',
    content:
      'For concerns about our data practices, contact our Data Protection Officer at privacy@onservice.ph or file a complaint with the NPC at complaints@privacy.gov.ph.',
  },
];

type Tab = 'terms' | 'privacy';

export default function TermsScreen(): React.ReactElement {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('terms');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const sections = activeTab === 'terms' ? TOS_SECTIONS : PRIVACY_SECTIONS;

  const toggleSection = (index: number): void => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
          onPress={() => { setActiveTab('terms'); setExpandedIndex(null); }}
        >
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
            Terms of Service
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
          onPress={() => { setActiveTab('privacy'); setExpandedIndex(null); }}
        >
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
            Privacy Policy
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.introCard}>
          <Text style={styles.introEmoji}>{activeTab === 'terms' ? '📜' : '🔒'}</Text>
          <Text style={styles.introTitle}>
            {activeTab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </Text>
          <Text style={styles.introDate}>Last updated: April 14, 2026</Text>
        </View>

        {sections.map((section, index) => (
          <TouchableOpacity
            key={index}
            style={styles.sectionCard}
            onPress={() => toggleSection(index)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.chevron}>{expandedIndex === index ? '▲' : '▼'}</Text>
            </View>
            {expandedIndex === index && (
              <Text style={styles.sectionContent}>{section.content}</Text>
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Questions?</Text>
          <Text style={styles.contactDesc}>
            If you have questions about our terms or privacy practices, contact us.
          </Text>
          <TouchableOpacity onPress={() => void Linking.openURL('mailto:support@onservice.ph')}>
            <Text style={styles.contactLink}>support@onservice.ph</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingTop: spacing.md, gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.body, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '700' },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },

  introCard: {
    alignItems: 'center', paddingVertical: spacing.lg,
    marginBottom: spacing.base,
  },
  introEmoji: { fontSize: 40, marginBottom: spacing.sm },
  introTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  introDate: { ...typography.caption, color: colors.textTertiary },

  sectionCard: {
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  sectionTitle: { ...typography.body, fontWeight: '600', color: colors.text, flex: 1 },
  chevron: { fontSize: 12, color: colors.textTertiary, marginLeft: spacing.sm },
  sectionContent: {
    ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20,
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },

  contactCard: {
    backgroundColor: colors.primaryLight, borderRadius: borderRadius.lg,
    padding: spacing.lg, alignItems: 'center', marginTop: spacing.md,
  },
  contactTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  contactDesc: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  contactLink: { ...typography.body, color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
});
