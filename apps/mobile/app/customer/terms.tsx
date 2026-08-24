import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ScrollText, Lock } from '@/components/icons';
// platformConfig + formatPHP imports removed in Phase 14 D04 — section 6
// no longer references SiguradoShield peso-amount coverage figures.
// Bug 834.
import { fetchCancellationPolicy, policyToTermsText } from '@/utils/cancellation-policy';
import { platformConfig } from '@/config/platform.config';

interface Section {
  title: string;
  content: string;
}

// Operating entity. Update if the registered business name/owner changes.
const ENTITY = 'onService PH';

const TOS_SECTIONS: Section[] = [
  {
    title: '1. Acceptance & Eligibility',
    content:
      `By downloading, accessing, registering for, or using the ${ENTITY} platform (the "Platform"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy, which together form a binding agreement between you and ${ENTITY}. If you do not agree, do not use the Platform.\n\nYou must be at least 18 years old and legally capable of entering into a binding contract under Philippine law. By using the Platform you represent that you meet these requirements and that the information you provide is accurate and current. These Terms are an electronic agreement and are enforceable under Republic Act No. 8792 (Electronic Commerce Act).`,
  },
  {
    title: '2. The Platform — Marketplace Only',
    content:
      `${ENTITY} operates an online marketplace that connects customers with independent third-party service providers for home and commercial services ("Services"). ${ENTITY} is NOT a service provider, contractor, employer, agent, or partner of any provider, and does not perform, supervise, control, or guarantee any Service.\n\nProviders are independent contractors. ${ENTITY} does not direct the manner or means by which a provider performs a Service. The contract for any Service is formed directly between the customer and the provider; ${ENTITY}'s role is limited to facilitating discovery, booking, communication, payment handling (escrow), and dispute facilitation.`,
  },
  {
    title: '3. Accounts',
    content:
      'You are responsible for the activity under your account and for keeping your login (your phone number and one-time codes) secure. Notify us immediately of any unauthorized use. We may refuse, suspend, or terminate an account that violates these Terms, the law, or the safety of others. One person may not maintain multiple accounts to evade limits, suspensions, or promotions.',
  },
  {
    // Bug 1170/1198 fix: this section's content is replaced at render time with
    // the live policy fetched from /api/v1/settings/cancellation-policy, matched
    // by title (see the useMemo below). The placeholder shows only briefly on a
    // cold boot before the request resolves.
    title: '4. Cancellation & Refund Policy',
    content: 'Loading current cancellation policy…',
  },
  {
    title: '5. Bookings, Pricing & Fees',
    content:
      'Prices shown at booking are server-calculated. The total you approve at checkout is the amount recorded for payment. Add-ons, change orders, or additional work agreed on-site may adjust the total through the in-app change-order flow, which requires your approval before any extra charge. The app provides an electronic transaction record after payment. It does not currently issue a document represented as an authorized BIR invoice or Official Receipt while the correct invoice model, tax basis, and numbering authority remain under accountant and legal review.',
  },
  {
    title: '6. Escrow Payments',
    content:
      'Payment methods shown as available in checkout use the Platform payment and escrow records. External card, GCash, Maya, QR Ph, bank-transfer authorization, and wallet top-up are currently disabled while their payment flow is corrected; the app does not create those payments while they are unavailable. An existing onService wallet balance may be used where checkout offers it. Funds recorded in escrow are released to the provider only after the applicable completion and dispute process. No cash or off-Platform payment is permitted; paying a provider directly removes your escrow, dispute, and Platform protections, and may result in account suspension.',
  },
  {
    title: '7. Dispute Resolution',
    content:
      `You have ${platformConfig.escrowDisputeWindowHours} hours after a job is marked complete to raise a dispute in the app. The provider may respond and the Platform support team reviews the booking record, statements, and submitted evidence. A recorded resolution may result in a full or partial refund from funds still available for settlement, a re-do, no refund, or release to the provider. Direct participant refund settlement is currently held while escrow timing is corrected; support records decisions through the admin case process. Pursuing a dispute through the Platform does not waive any right you may have to pursue the provider directly.`,
  },
  {
    // F#10 / Bug 834 — finalized "no insurance" + liability disclaimer.
    // Covers the four required points: (1) marketplace status, (2) the explicit
    // list of platform protections, (3) independent-contractor liability, and
    // (4) the insurance recommendation. Drafted to be comprehensive and
    // attorney-reviewable; do not reintroduce a TODO placeholder (CI-guarded).
    title: '8. Platform Protections — No Insurance',
    content:
      `${ENTITY} is a marketplace, not an insurer. ${ENTITY} does NOT provide, and does not act as a broker for, any insurance covering property damage, personal injury, theft, or loss arising from a Service. Nothing on the Platform is an insurance policy or a guarantee of a provider's work.\n\nWhat the Platform does provide:\n• NBI clearance and identity verification before provider activation\n• Platform escrow and payment records for supported in-app payments\n• In-app booking chat without displaying personal phone numbers to the other participant\n• A ${platformConfig.escrowDisputeWindowHours}-hour dispute filing window with platform review\n• Provider rating accountability and suspension review rules\n\nProviders are independent contractors and are solely responsible for any loss, injury, or damage they cause in performing a Service. You may pursue a claim directly against the provider, and the Platform's dispute process can help facilitate a refund from funds still available for settlement where appropriate. Because Platform protections are not insurance, you should maintain your own homeowner's or renter's insurance for losses that exceed those protections.`,
  },
  {
    title: '9. User Conduct',
    content:
      'You agree not to: circumvent the Platform for direct/off-Platform payment; misrepresent your identity or a Service; harass, threaten, or discriminate against any person; post false reviews; upload unlawful, infringing, or malicious content; scrape, reverse-engineer, or disrupt the Platform; or use the Platform for any unlawful purpose. Violations may result in immediate suspension or termination and, where warranted, referral to authorities.',
  },
  {
    title: '10. Provider Obligations',
    content:
      `Providers represent that they are legally able to offer their Services, hold any required licenses or permits, will perform competently and lawfully, and are responsible for their own taxes, tools, and personnel (including any approved team members they add). Providers must complete identity and NBI verification and maintain accurate profiles, service selections, and availability. ${ENTITY} may review, suspend, or remove a provider for safety, quality, fraud, or legal reasons.`,
  },
  {
    title: '11. Disclaimer of Warranties',
    content:
      `To the maximum extent permitted by Philippine law, the Platform is provided "as is" and "as available." ${ENTITY} makes no warranty that the Platform will be uninterrupted, error-free, or secure, and disclaims all implied warranties to the extent permitted. ${ENTITY} does not warrant the quality, safety, legality, or outcome of any Service performed by a provider. This section does not limit any non-waivable rights you have as a consumer under Republic Act No. 7394 (Consumer Act of the Philippines).`,
  },
  {
    title: '12. Limitation of Liability',
    content:
      `To the maximum extent permitted by law, ${ENTITY} and its officers, employees, and agents are not liable for indirect, incidental, special, consequential, or punitive damages, or for loss of data, profits, or goodwill, arising from your use of the Platform or any Service. Where liability cannot be excluded, ${ENTITY}'s total aggregate liability to you for any claim is limited to the greater of (a) the total Platform service fees you paid for the booking giving rise to the claim, or (b) the amount then held in escrow for that booking. Nothing here limits liability that cannot be limited by law, including liability for fraud or for death or personal injury caused by ${ENTITY}'s own negligence.`,
  },
  {
    title: '13. Indemnification',
    content:
      `You agree to indemnify and hold ${ENTITY} harmless from claims, damages, and reasonable expenses arising from your breach of these Terms, your misuse of the Platform, or your violation of any law or the rights of a third party.`,
  },
  {
    title: '14. Intellectual Property',
    content:
      `The Platform, including its software, design, trademarks, and content (excluding content you submit), is owned by ${ENTITY} or its licensors and is protected by law. You receive a limited, non-exclusive, non-transferable, revocable licence to use the Platform for its intended purpose. You retain rights to content you submit but grant ${ENTITY} a licence to use it as needed to operate the Platform.`,
  },
  {
    title: '15. Suspension & Termination',
    content:
      'You may stop using the Platform and request account deletion at any time (subject to legal retention of financial records). We may suspend or terminate your access for breach of these Terms, suspected fraud, legal requirement, or risk to others. Sections that by their nature should survive termination (payments owed, disputes, disclaimers, limitation of liability, indemnification, governing law) survive.',
  },
  {
    title: '16. Data Privacy',
    content:
      'We collect and process personal data in accordance with Republic Act No. 10173 (Data Privacy Act of 2012) and our Privacy Policy (see the Privacy tab). Your data is used to operate the Platform and is never sold. You have the rights of a data subject, including access, correction, objection, erasure (subject to legal retention), and the right to complain to the National Privacy Commission.',
  },
  {
    title: '17. Consumer Rights',
    content:
      'Nothing in these Terms removes or limits rights you have under Republic Act No. 7394 (Consumer Act of the Philippines) or other mandatory consumer-protection law. Where a provision of these Terms conflicts with a non-waivable consumer right, that right prevails to the extent of the conflict.',
  },
  {
    title: '18. Changes to These Terms',
    content:
      'We may update these Terms from time to time. Material changes will be notified in-app or by message before they take effect. The "Last updated" date below shows the current version. Your continued use after a change takes effect means you accept the updated Terms.',
  },
  {
    title: '19. Governing Law & Venue',
    content:
      'These Terms are governed by the laws of the Republic of the Philippines. The parties will attempt in good faith to resolve disputes amicably; failing that, the proper courts of Cebu City (or another venue required by law for consumer claims) have jurisdiction, without prejudice to any non-waivable right of a consumer to file where the law allows.',
  },
  {
    title: '20. General',
    content:
      `If any provision of these Terms is found unenforceable, the rest remain in effect. ${ENTITY}'s failure to enforce a provision is not a waiver. These Terms, with the Privacy Policy and the in-app cancellation policy, are the entire agreement between you and ${ENTITY} regarding the Platform. You may not assign these Terms; ${ENTITY} may assign them to a successor of its business. Questions: support@onservice.ph.`,
  },
];

const PRIVACY_SECTIONS: Section[] = [
  {
    title: 'Who We Are (Data Controller)',
    content:
      `${ENTITY} is the Personal Information Controller for the personal data processed through the Platform, in accordance with Republic Act No. 10173 (Data Privacy Act of 2012), its Implementing Rules, and issuances of the National Privacy Commission (NPC). Our Data Protection Officer can be reached at privacy@onservice.ph.`,
  },
  {
    title: 'What We Collect',
    content:
      'Account & contact data: name, phone number, email (optional), and service addresses. Booking data: your bookings, messages, photos you upload, ratings, and history. Payment data: handled by our payment partner; card details are tokenized and never stored in raw form by us. Device & usage data: device identifiers, app version, log/diagnostic data, and approximate or precise location when you enable it. Provider applicants additionally submit identity documents and NBI clearance for verification.',
  },
  {
    title: 'Why We Process It (Legal Basis)',
    content:
      'We process your data to: create and run your account and bookings (performance of our contract with you); maintain payment, transaction, tax, and accounting records, verify providers, prevent fraud and abuse, and keep the Platform safe (our legitimate interests and legal obligations); send service notifications; resolve disputes; and comply with legal requirements. Where we rely on your consent (for example, precise location or optional marketing), you may withdraw it at any time.',
  },
  {
    title: 'How We Share It',
    content:
      'We share only what is needed: with the provider for a booking (your name, address, and job details); with our payment partner (PayMongo) to process payment; with infrastructure and communication vendors that help us run the service under confidentiality obligations; and with government authorities or courts when legally required. We do NOT sell your personal data.',
  },
  {
    title: 'Sensitive & Identity Documents',
    content:
      `Provider identity documents (government ID, NBI clearance, selfie) are treated as confidential. They are stored privately and are accessible only to the document owner and authorized ${ENTITY} review staff through an authenticated channel — never by a public link.`,
  },
  {
    title: 'Security',
    content:
      'We use reasonable organizational, physical, and technical safeguards, including encryption in transit (TLS), access controls, server-side verification of payments, and restricted access to personal data on a need-to-know basis. No system is perfectly secure, but we work to protect your data and will notify you and the NPC of a personal data breach as required by law.',
  },
  {
    title: 'Data Retention',
    content:
      'We keep account data while your account is active. A deletion request enters a 30-day cooling-off period and then deactivates and anonymizes the account where the request remains eligible. Some financial, tax, fraud, safety, dispute, and compliance records may be retained where required by law or needed to establish or resolve legal claims. The app does not promise immediate or complete physical erasure of every related record.',
  },
  {
    title: 'Your Rights as a Data Subject',
    content:
      'Under the Data Privacy Act you have the right to be informed, to access your data, to correct inaccurate data, to object to or withdraw consent for certain processing, to erasure or blocking (subject to legal retention), to data portability, to lodge a complaint, and to damages for a violation. You can exercise most of these in-app under Data & Privacy, or by contacting our DPO.',
  },
  {
    title: 'Children',
    content:
      'The Platform is intended for users 18 and older. We do not knowingly collect personal data from minors. If you believe a minor has provided us data, contact our DPO so we can remove it.',
  },
  {
    title: 'Contact & the NPC',
    content:
      'For any privacy concern, contact our Data Protection Officer at privacy@onservice.ph. You may also file a complaint with the National Privacy Commission at complaints@privacy.gov.ph or https://privacy.gov.ph.',
  },
];

type Tab = 'terms' | 'privacy';

export default function TermsScreen(): React.ReactElement {
  const router = useRouter();
  // BUG-PHASE63-01 fix — accept ?tab=privacy so login/register/checkout
  // can deep-link to the Privacy Policy tab from their inline legal lines.
  // Pre-fix the screen always opened on the Terms tab even if the caller
  // wanted Privacy.
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: Tab = params.tab === 'privacy' ? 'privacy' : 'terms';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    const next: Tab = params.tab === 'privacy' ? 'privacy' : 'terms';
    setActiveTab(next);
    setExpandedIndex(null);
  }, [params.tab]);

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
    // Substitute the live cancellation policy by matching the section title
    // (robust if the Terms are re-numbered), not a hardcoded index.
    return baseline.map((s) =>
      /cancellation/i.test(s.title)
        ? { ...s, content: policyToTermsText(policyQuery.data) }
        : s,
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
          <Text style={styles.introDate}>Interim text updated: August 24, 2026</Text>
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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingTop: spacing.md, gap: spacing.sm,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
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
