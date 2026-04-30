import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ScrollText, Lock } from '@/components/icons';
// platformConfig + formatPHP imports removed in Phase 14 D04 — section 6
// no longer references SiguradoShield peso-amount coverage figures.
// Bug 834.
import { fetchCancellationPolicy, policyToTermsText } from '@/utils/cancellation-policy';

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
    // Bug 1170/1198 fix: content is replaced at render time with the active
    // policy fetched from /api/v1/settings/cancellation-policy. The
    // placeholder below appears only on a fresh boot before the request
    // resolves — once the cache is warm, the real text shows immediately.
    title: '4. Cancellation & Refund Policy',
    content: 'Loading current cancellation policy…',
  },
  {
    title: '5. Dispute Resolution',
    content:
      'Customers have 48 hours after job completion to file a dispute. Disputes are resolved through our tiered system: automated resolution, mediation, and admin arbitration. The platform defaults to protecting the customer when evidence is ambiguous.',
  },
  {
    // Bug 834 — Phase 14 D04 SiguradoShield pull. Section 6 previously
    // promised buyer protection with peso-amount coverage. The platform
    // does NOT provide insurance for v1.0 — see LAUNCH-LIMITATIONS.md §23
    // and .ai-coder/decisions/D04-siguradoshield.md §legal-language.
    // Ken supplies the exact disclaimer wording in a follow-up commit.
    title: '6. Platform protections (no insurance)',
    // Phase 14 Remediation #10 (partial). Interim wording — pending
    // attorney review. Ken's lawyer must sign off on this exact text
    // before v1.0.0-launch-ready. See .ai-coder/decisions/D04-siguradoshield.md
    // §legal-language for the original requirement.
    content:
      'onService PH is a marketplace connecting customers with independent service providers. We do not provide insurance coverage for property damage, personal injury, or service disputes.\n\nOur platform protections include:\n• NBI clearance verification for every provider before activation\n• Escrow payment held until service completion\n• Masked phone numbers between customer and provider\n• 48-hour dispute window with platform-mediated resolution\n• Provider rating accountability — providers below 4.0 stars after 20 jobs face suspension review\n\nFor loss or damage that exceeds these protections, customers should maintain their own homeowner\'s or renter\'s insurance. The provider, as an independent contractor, is responsible for any property damage they cause; customers may pursue claims directly against the provider through our dispute process.',
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

  // Bug 1170/1198 fix: pull the live cancellation policy and substitute
  // section #4's content. 5-minute staleTime — same as the server cache.
  const policyQuery = useQuery({
    queryKey: ['cancellation-policy'],
    queryFn: fetchCancellationPolicy,
    staleTime: 5 * 60_000,
  });

  const sections = useMemo(() => {
    const baseline = activeTab === 'terms' ? TOS_SECTIONS : PRIVACY_SECTIONS;
    if (activeTab !== 'terms' || !policyQuery.data) return baseline;
    return baseline.map((s, i) =>
      i === 3 ? { ...s, content: policyToTermsText(policyQuery.data) } : s,
    );
  }, [activeTab, policyQuery.data]);

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
          <View style={styles.introEmojiWrap}>
            {activeTab === 'terms'
              ? <ScrollText size={48} color={colors.primary} />
              : <Lock size={48} color={colors.primary} />}
          </View>
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
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
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
  introEmojiWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
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
