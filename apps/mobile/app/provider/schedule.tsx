import React, { useState, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMySchedule, setMySchedule, type ScheduleSlot } from '@/services/provider-api.service';
import { getErrorMessage } from '@/utils/errors';
// A7 — shared UI kit for loading state + toast feedback.
import { Button, SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Check, ChevronLeft } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DaySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

const DEFAULT_SCHEDULE: DaySchedule[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  startTime: '08:00',
  endTime: '17:00',
  isAvailable: i >= 1 && i <= 5,
}));

export default function ScheduleScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone, isDesktop } = useResponsive();

  const { data: existingSchedule, isLoading, isError: scheduleError, refetch: refetchSchedule, isRefetching: scheduleRefetching } = useQuery({
    queryKey: ['providerSchedule'],
    queryFn: getMySchedule,
    staleTime: 60 * 1000,
  });

  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (existingSchedule && existingSchedule.length > 0) {
      const merged = DEFAULT_SCHEDULE.map((day) => {
        const existing = existingSchedule.find((s: ScheduleSlot) => s.dayOfWeek === day.dayOfWeek);
        if (existing) {
          return {
            dayOfWeek: existing.dayOfWeek,
            startTime: existing.startTime,
            endTime: existing.endTime,
            isAvailable: existing.isAvailable,
          };
        }
        return day;
      });
      setSchedule(merged);
    }
  }, [existingSchedule]);

  // BUG-PHASE50-02 fix — pre-fix the Save button fired the mutation
  // with no client-side validation of the HH:MM time strings or
  // start < end ordering. Provider would type "8:00" (missing
  // leading zero) or "08:00" / "07:00" (end < start) and the
  // server would 4xx with a generic message. Now: validate up-
  // front and surface the offending day clearly.
  const validateSchedule = (): string | null => {
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const day of schedule) {
      if (!day.isAvailable) continue;
      if (!timeRe.test(day.startTime)) {
        return `${DAY_NAMES[day.dayOfWeek]}: invalid start time "${day.startTime}". Use HH:MM (e.g. 08:00).`;
      }
      if (!timeRe.test(day.endTime)) {
        return `${DAY_NAMES[day.dayOfWeek]}: invalid end time "${day.endTime}". Use HH:MM (e.g. 17:00).`;
      }
      if (day.startTime >= day.endTime) {
        return `${DAY_NAMES[day.dayOfWeek]}: end time must be later than start time.`;
      }
    }
    return null;
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const err = validateSchedule();
      if (err) return Promise.reject(new Error(err));
      return setMySchedule(schedule);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerSchedule'] });
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      setHasChanges(false);
      showToast('Your schedule has been updated.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to save schedule.'), 'error');
    },
  });

  const toggleDay = (dayOfWeek: number): void => {
    setSchedule((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, isAvailable: !d.isAvailable } : d,
      ),
    );
    setHasChanges(true);
  };

  const updateTime = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string): void => {
    setSchedule((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d,
      ),
    );
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (scheduleError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Weekly Schedule</Text>
        </View>
        <ErrorState
          message="We couldn't load your saved schedule. Editing is locked so the fallback hours cannot overwrite your real availability."
          onRetry={() => void refetchSchedule()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Weekly Schedule</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={scheduleRefetching} onRefresh={() => void refetchSchedule()} tintColor={colors.secondary} />}
      >
        <Text style={styles.description}>
          Set your weekly availability. Customers will only see you as available during these hours.
        </Text>

        <View
          style={[styles.scheduleGrid, !isPhone && styles.scheduleGridWide]}
          accessibilityLabel={isPhone ? 'Weekly schedule list' : 'Weekly schedule grid'}
        >
        {schedule.map((day) => (
          <View
            key={day.dayOfWeek}
            style={[styles.dayCard, !isPhone && styles.dayCardWide, !day.isAvailable && styles.dayCardDisabled]}
            accessibilityLabel={`${DAY_NAMES[day.dayOfWeek]} schedule`}
          >
            <TouchableOpacity
              style={styles.dayToggle}
              onPress={() => toggleDay(day.dayOfWeek)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, day.isAvailable && styles.checkboxActive]}>
                {day.isAvailable && <Check size={15} color={colors.white} />}
              </View>
              <Text style={[styles.dayName, !day.isAvailable && styles.dayNameDisabled]}>
                {DAY_NAMES[day.dayOfWeek]}
              </Text>
            </TouchableOpacity>

            {day.isAvailable && (
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={day.startTime}
                  onChangeText={(v) => updateTime(day.dayOfWeek, 'startTime', v)}
                  placeholder="08:00"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={5}
                />
                <Text style={styles.timeSeparator}>to</Text>
                <TextInput
                  style={styles.timeInput}
                  value={day.endTime}
                  onChangeText={(v) => updateTime(day.dayOfWeek, 'endTime', v)}
                  placeholder="17:00"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={5}
                />
              </View>
            )}
          </View>
        ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, isDesktop && styles.bottomBarDesktop, { paddingBottom: insets.bottom + spacing.base }]}>
        <View style={isDesktop ? styles.desktopSaveAction : undefined}>
          <Button
            title={saveMutation.isPending ? 'Saving...' : 'Save Schedule'}
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!hasChanges || saveMutation.isPending}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 120 },
  scrollContentWide: { padding: spacing.xl, paddingBottom: 120 },
  scheduleGrid: { width: '100%' },
  scheduleGridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },

  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  dayCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  dayCardWide: { flexBasis: '48%', flexGrow: 1, minWidth: 280, marginBottom: 0 },
  dayCardDisabled: { opacity: 0.6 },
  dayToggle: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  checkMark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  dayName: { ...typography.body, color: colors.text, fontWeight: '600' },
  dayNameDisabled: { color: colors.textTertiary },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingLeft: 40,
  },
  timeInput: {
    ...typography.body,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    textAlign: 'center',
    width: 80,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeSeparator: { ...typography.body, color: colors.textTertiary, marginHorizontal: spacing.md },

  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  bottomBarDesktop: { alignItems: 'flex-end' },
  desktopSaveAction: { width: 320 },
});
