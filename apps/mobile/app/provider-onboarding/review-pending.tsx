import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ClipboardList } from '@/components/icons';

export default function ReviewPendingScreen(): React.ReactElement {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}><ClipboardList size={64} color={colors.primary} /></View>
        <Text style={styles.title}>Application Under Review</Text>
        <Text style={styles.subtitle}>
          Thank you for applying to become an onService provider!
          Our team will review your documents and verify your identity.
        </Text>

        <View style={styles.timeline}>
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, styles.timelineDotDone]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>Application Submitted</Text>
              <Text style={styles.timelineHint}>Just now</Text>
            </View>
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, styles.timelineDotActive]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>Identity Verification</Text>
              <Text style={styles.timelineHint}>In progress</Text>
            </View>
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabelPending}>NBI Clearance Check</Text>
              <Text style={styles.timelineHint}>Pending</Text>
            </View>
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabelPending}>Profile Activated</Text>
              <Text style={styles.timelineHint}>24-48 hours</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            We'll notify you via SMS and push notification once your application
            is approved. Estimated review time is 24-48 hours.
          </Text>
        </View>

        <Button
          title="Go to Home"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  icon: { fontSize: 64, textAlign: 'center', marginBottom: spacing.base },
  iconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  timeline: { marginBottom: spacing.xl },
  timelineItem: { flexDirection: 'row', alignItems: 'center' },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    marginRight: spacing.base,
  },
  timelineDotDone: { backgroundColor: colors.success },
  timelineDotActive: { backgroundColor: colors.primary },
  timelineLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 7,
  },
  timelineContent: { flex: 1, paddingVertical: spacing.xs },
  timelineLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  timelineLabelPending: { ...typography.body, color: colors.textTertiary },
  timelineHint: { ...typography.caption, color: colors.textTertiary },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoIcon: { fontSize: 18, marginTop: 2 },
  infoText: { ...typography.bodySmall, color: colors.infoDark, flex: 1, lineHeight: 20 },
});
