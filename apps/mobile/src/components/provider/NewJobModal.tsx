/**
 * NewJobModal — Real-time new job notification overlay for providers.
 *
 * Appears over any screen when the provider receives a `new:job` socket event.
 * Provider has 60 seconds to Accept (navigate to job) or Decline (cancel match).
 * Auto-dismisses after 60 seconds with no action (job will be re-matched).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateBookingStatus } from '@/services/provider-api.service';
import { getSocket } from '@/services/socket.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const COUNTDOWN_SECONDS = 60;

interface NewJobEvent {
  bookingId: string;
  serviceName: string;
  amount: number;
  city: string;
  title: string;
  body: string;
}

export default function NewJobModal(): React.ReactElement | null {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [job, setJob] = useState<NewJobEvent | null>(null);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  const clearTimer = useCallback((): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    progressAnim.stopAnimation();
  }, [progressAnim]);

  const dismiss = useCallback((): void => {
    clearTimer();
    setJob(null);
    setTimeLeft(COUNTDOWN_SECONDS);
    progressAnim.setValue(1);
  }, [clearTimer, progressAnim]);

  // Listen for new:job socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: NewJobEvent): void => {
      // If a modal is already showing, dismiss the old one
      setJob(null);
      setTimeLeft(COUNTDOWN_SECONDS);

      // Show the new job after a brief reset
      setTimeout(() => {
        setJob(data);
      }, 100);
    };

    socket.on('new:job', handler);
    return () => { socket.off('new:job', handler); };
  }, []);

  // Start countdown when job appears
  useEffect(() => {
    if (!job) return;

    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: COUNTDOWN_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

    setTimeLeft(COUNTDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          dismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { clearTimer(); };
  }, [job, dismiss, clearTimer, progressAnim]);

  const declineMutation = useMutation({
    mutationFn: (bookingId: string) =>
      updateBookingStatus(bookingId, 'cancelled_by_provider'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
      dismiss();
    },
    onError: () => {
      // Still dismiss — the backend will handle rematch
      dismiss();
    },
  });

  const handleAccept = (): void => {
    if (!job) return;
    clearTimer();
    const bookingId = job.bookingId;
    setJob(null);
    router.push(`/provider/job/${bookingId}`);
  };

  const handleDecline = (): void => {
    if (!job) return;
    Alert.alert(
      'Decline Job',
      'Are you sure you want to decline this job? It will be offered to another provider.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => { declineMutation.mutate(job.bookingId); },
        },
      ],
    );
  };

  if (!job) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const isUrgent = timeLeft <= 15;

  return (
    <Modal
      visible={!!job}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressWidth },
                isUrgent && styles.progressFillUrgent,
              ]}
            />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <Text style={styles.icon}>🔧</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>New Job Request!</Text>
              <Text style={[styles.timer, isUrgent && styles.timerUrgent]}>
                {timeLeft}s to respond
              </Text>
            </View>
          </View>

          {/* Job details */}
          <View style={styles.details}>
            <Text style={styles.serviceName}>{job.serviceName}</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>📍 Location</Text>
              <Text style={styles.detailValue}>{job.city}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>💰 Earnings</Text>
              <Text style={styles.amountText}>{formatPHP(job.amount)}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={handleDecline}
              disabled={declineMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Decline job"
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept job"
            >
              <Text style={styles.acceptText}>Accept Job</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.border,
    width: '100%',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.secondary,
  },
  progressFillUrgent: {
    backgroundColor: colors.error,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 26 },
  headerText: { flex: 1 },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  timer: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timerUrgent: {
    color: colors.error,
    fontWeight: '600',
  },
  details: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  serviceName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
  },
  amountText: {
    ...typography.priceSmall,
    color: colors.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  declineButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  acceptButton: {
    flex: 2,
    minHeight: 50,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    ...typography.button,
    color: colors.white,
  },
});
