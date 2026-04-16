import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMySchedule, setMySchedule, type ScheduleSlot } from '@/services/provider-api.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

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

  const saveMutation = useMutation({
    mutationFn: () => setMySchedule(schedule),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerSchedule'] });
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      setHasChanges(false);
      Alert.alert('Saved', 'Your schedule has been updated.');
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to save schedule.');
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
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Weekly Schedule</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={scheduleRefetching} onRefresh={() => void refetchSchedule()} tintColor={colors.secondary} />}
      >
        {scheduleError && (
          <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load your saved schedule. Showing defaults.</Text>
          </View>
        )}
        <Text style={styles.description}>
          Set your weekly availability. Customers will only see you as available during these hours.
        </Text>

        {schedule.map((day) => (
          <View key={day.dayOfWeek} style={[styles.dayCard, !day.isAvailable && styles.dayCardDisabled]}>
            <TouchableOpacity
              style={styles.dayToggle}
              onPress={() => toggleDay(day.dayOfWeek)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, day.isAvailable && styles.checkboxActive]}>
                {day.isAvailable && <Text style={styles.checkMark}>✓</Text>}
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
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button
          title={saveMutation.isPending ? 'Saving...' : 'Save Schedule'}
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!hasChanges || saveMutation.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 120 },

  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  dayCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
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
    backgroundColor: colors.background,
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
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
