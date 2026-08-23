// Provider Standards / Community Guidelines — surfaces the onService quality +
// vetting + differentiation standards in-app (previously only in the repo
// handbook). Reachable from Help and from the low-rating quality notification.
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { AlarmClock, ChevronLeft, IdCard, Lock, MessageSquare, Receipt, Star, Wrench } from '@/components/icons';

type StandardIcon = ComponentType<{ size?: number; color?: string }>;

interface Standard {
  icon: StandardIcon;
  title: string;
  body: string;
}

// Drawn from the company vetting rubric (docs/operations/04) + the quality and
// differentiation guidelines. Kept short and provider-facing.
const STANDARDS: Standard[] = [
  {
    icon: IdCard,
    title: 'Be verified and legitimate',
    body: 'Keep your NBI clearance current and your ID, selfie, and business details accurate. Expired or missing clearance pauses you from new jobs.',
  },
  {
    icon: AlarmClock,
    title: 'Show up on time, every time',
    body: 'Accept only jobs you can do, arrive within your window, and keep the customer updated on your status. Reliability is the single biggest driver of your rating.',
  },
  {
    icon: MessageSquare,
    title: 'Communicate clearly and kindly',
    body: 'Reply in the in-app chat, set expectations, and be professional. Harassment, pressure, or abusive language can get you suspended.',
  },
  {
    icon: Receipt,
    title: 'Quote honestly and in detail',
    body: 'Use itemized quotes (labor, materials, equipment). If the scope grows, send a change order and get approval before you do extra paid work. No surprise charges.',
  },
  {
    icon: Lock,
    title: 'Stay on the platform',
    body: 'Keep payments, chat, and bookings on onService. It protects you with escrow and our guarantee, and protects the customer. Taking deals off-app is a serious violation.',
  },
  {
    icon: Wrench,
    title: 'Do quality work and stand behind it',
    body: 'Take before/after photos, finish the checklist, and fix legitimate issues. Escrow releases to you once the customer confirms the job was done right.',
  },
  {
    icon: Star,
    title: 'How your standing works',
    body: 'Your rating, completion rate, on-time rate, and dispute history feed your standing and tier. Higher standing means better placement and more jobs. A few low ratings are recoverable: respond professionally, learn from the feedback, and keep delivering.',
  },
];

export default function ProviderStandardsScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Provider Standards</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>
          These are the standards that keep onService trusted and keep good providers busy. Living up to
          them is how you earn a strong rating, a higher tier, and more jobs.
        </Text>
        {STANDARDS.map((standard) => {
          const StandardIcon = standard.icon;
          return (
            <View key={standard.title} style={styles.card}>
              <View style={styles.cardTitleRow}>
                <StandardIcon size={20} color={colors.primary} />
                <Text style={styles.cardTitle}>{standard.title}</Text>
              </View>
              <Text style={styles.cardBody}>{standard.body}</Text>
            </View>
          );
        })}
        <Text style={styles.footer}>
          Repeated or serious violations can lead to suspension or removal. Questions? Reach us from Help.
        </Text>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text },
  body: { padding: spacing.md, gap: spacing.sm },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBody: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  footer: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm, marginBottom: spacing.lg },
});
