import React, { useState, useCallback, useMemo } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type DimensionValue,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getCalendarData, type CalendarJob, type AvailabilityOverride } from '@/services/provider-api.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Settings } from '@/components/icons';
// A7 — shared empty state for the selected-day job list.
import { EmptyState } from '@/components/ui';
import { formatPHP } from '@/utils/currency';

import { Routes } from '@/config/navigation';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_COLORS: Record<string, string> = {
  confirmed: colors.info,
  in_progress: colors.success,
  paid: colors.primary,
  payment_pending: colors.warning,
  pending: colors.textTertiary,
  quoted: colors.secondary,
  // Phase 200 — live job states were missing, so en-route/arrived/completed
  // jobs rendered as grey "unknown" dots on the calendar.
  matched: colors.info,
  provider_en_route: colors.success,
  provider_arrived: colors.success,
  completed_by_provider: colors.statusCompleted,
  payout_ready: colors.statusCompleted,
  paid_out: colors.statusCompleted,
};

// BUG-PHASE105-01 fix — pre-fix the from/to range was anchored to UTC
// (2026-05-01T00:00:00Z … 2026-05-31T23:59:59Z) and toDateKey binned
// jobs by the DEVICE timezone via getFullYear/getMonth/getDate. For
// the platform's launch market (Boracay / Asia/Manila, UTC+8) this
// caused TWO month-boundary defects:
//   1. Jobs scheduled 00:00–07:59 Manila on the 1st of the month were
//      16:00–23:59 UTC the previous day, so they fell OUTSIDE the
//      from-anchored UTC window — provider's calendar silently dropped
//      them. A 6 AM appointment on the 1st would be invisible.
//   2. Jobs scheduled 00:00–07:59 Manila on the 1st of the FOLLOWING
//      month appeared in the current month (because their UTC instant
//      is ~16:00 UTC of the last day still inside the to-anchor).
// And on a device set to a non-Manila timezone (a Filipino traveling
// abroad, or a QA/staging device on UTC), `d.getDate()` returned the
// device-local day — jobs near midnight Manila landed on the wrong
// calendar cell.
//
// Fix: anchor the from/to range to Manila offset (+08:00) so the UTC
// window the API queries genuinely covers the Manila calendar month
// edge-to-edge, and bin job timestamps via Asia/Manila to keep the
// per-cell grouping stable regardless of device timezone.
function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from: from + 'T00:00:00+08:00', to: to + 'T23:59:59+08:00' };
}

function toDateKey(dt: Date | string): string {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  // toLocaleDateString('en-CA', { timeZone }) produces YYYY-MM-DD in
  // the named timezone — same shape as the pre-fix function but with
  // Manila as the canonical "what day is it" answer.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export default function ProviderCalendarScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateKey(today));

  const { from, to } = useMemo(() => getMonthRange(viewYear, viewMonth), [viewYear, viewMonth]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['provider-calendar', from, to],
    queryFn: () => getCalendarData(from, to),
  });

  const jobsByDate = useMemo((): Record<string, CalendarJob[]> => {
    if (!data?.jobs) return {};
    const map: Record<string, CalendarJob[]> = {};
    data.jobs.forEach((job) => {
      const key = toDateKey(job.scheduledAt);
      if (!map[key]) map[key] = [];
      map[key].push(job);
    });
    return map;
  }, [data?.jobs]);

  const overridesByDate = useMemo((): Record<string, AvailabilityOverride> => {
    if (!data?.overrides) return {};
    const map: Record<string, AvailabilityOverride> = {};
    data.overrides.forEach((o) => { map[o.overrideDate] = o; });
    return map;
  }, [data?.overrides]);

  const calendarDays = useMemo((): (number | null)[] => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [viewYear, viewMonth]);

  const navigateMonth = useCallback((delta: number): void => {
    setSelectedDate(null);
    let newMonth = viewMonth + delta;
    let newYear = viewYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setViewMonth(newMonth);
    setViewYear(newYear);
  }, [viewMonth, viewYear]);

  const handleDayPress = useCallback((day: number): void => {
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(key);
  }, [viewYear, viewMonth]);

  const selectedJobs = selectedDate ? (jobsByDate[selectedDate] ?? []) : [];
  const selectedOverride = selectedDate ? overridesByDate[selectedDate] : undefined;
  const todayKey = toDateKey(today);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Schedule</Text>
        <TouchableOpacity
          onPress={(): void => { router.push(Routes.PROVIDER.AVAILABILITY); }}
          style={styles.settingsBtn}
        >
          <Settings size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={(): void => { navigateMonth(-1); }} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={(): void => { navigateMonth(1); }} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dayHeaders}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={styles.dayHeaderText}>{d}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((day, idx) => {
          if (day === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;
          const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasJobs = !!jobsByDate[key]?.length;
          const hasOverride = !!overridesByDate[key];
          const override = overridesByDate[key];
          const isBlocked = hasOverride && override != null && !override.isAvailable;
          const isSelected = selectedDate === key;
          const isToday = key === todayKey;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.dayCell,
                isToday && styles.todayCell,
                isSelected && styles.selectedCell,
                isBlocked && styles.blockedCell,
              ]}
              onPress={(): void => { handleDayPress(day); }}
              activeOpacity={0.6}
            >
              <Text style={[
                styles.dayNumber,
                isToday && styles.todayNumber,
                isSelected && styles.selectedNumber,
                isBlocked && styles.blockedNumber,
              ]}>
                {day}
              </Text>
              {hasJobs && (
                <View style={styles.dotRow}>
                  {(jobsByDate[key] ?? []).slice(0, 3).map((j) => (
                    <View
                      key={j.id}
                      style={[styles.dot, { backgroundColor: STATUS_COLORS[j.status] ?? colors.textTertiary }]}
                    />
                  ))}
                </View>
              )}
              {isBlocked && <View style={styles.blockedBar} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={colors.secondary} />
        </View>
      )}

      {isError && (
        <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load calendar data. Pull to refresh.</Text>
        </View>
      )}

      <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
        {selectedDate && (
          <Text style={styles.detailDateLabel}>
            {formatDateFull(selectedDate)}
          </Text>
        )}

        {selectedOverride && (
          <View style={[styles.overrideNotice, selectedOverride.isAvailable ? styles.overrideAvailable : styles.overrideBlocked]}>
            <Text style={styles.overrideNoticeText}>
              {selectedOverride.isAvailable
                ? `Custom hours: ${selectedOverride.startTime ?? ''} – ${selectedOverride.endTime ?? ''}`
                : `Blocked${selectedOverride.reason ? ` — ${selectedOverride.reason}` : ''}`}
            </Text>
          </View>
        )}

        {selectedJobs.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No jobs scheduled"
            description="You have no jobs on this day."
          />
        ) : (
          selectedJobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={(): void => { router.push(`/provider/job/${job.id}`); }}
              activeOpacity={0.7}
            >
              <View style={[styles.jobStatusBar, { backgroundColor: STATUS_COLORS[job.status] ?? colors.textTertiary }]} />
              <View style={styles.jobInfo}>
                <Text style={styles.jobTime}>
                  {new Date(job.scheduledAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                </Text>
                <Text style={styles.jobService}>{job.serviceName}</Text>
                <Text style={styles.jobCustomer}>{job.customerName}</Text>
                {job.address && (
                  <Text style={styles.jobAddress} numberOfLines={1}>{job.address}</Text>
                )}
              </View>
              <View style={styles.jobMeta}>
                <Text style={styles.jobPrice}>{formatPHP(job.totalAmount)}</Text>
                <Text style={styles.jobStatus}>{job.status.replace(/_/g, ' ')}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const CELL_SIZE = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
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
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  settingsBtn: { padding: spacing.sm },
  settingsBtnText: { fontSize: 20 },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  navBtn: { padding: spacing.sm, width: 40, alignItems: 'center' },
  navBtnText: { fontSize: 28, color: colors.secondary, fontWeight: '700' },
  monthLabel: { ...typography.body, fontWeight: '700', color: colors.text },

  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayCell: {
    width: `${100 / 7}%` as DimensionValue,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  todayCell: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
  },
  selectedCell: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.sm,
  },
  blockedCell: { opacity: 0.5 },
  dayNumber: { ...typography.bodySmall, color: colors.text, fontWeight: '500' },
  todayNumber: { color: colors.primary, fontWeight: '700' },
  selectedNumber: { color: colors.white, fontWeight: '700' },
  blockedNumber: { color: colors.error },

  dotRow: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 2,
    gap: 2,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  blockedBar: {
    position: 'absolute',
    bottom: 0,
    left: '20%' as DimensionValue,
    right: '20%' as DimensionValue,
    height: 2,
    backgroundColor: colors.error,
    borderRadius: 1,
  },

  loadingOverlay: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },

  detailScroll: { flex: 1 },
  detailContent: {
    padding: spacing.base,
    paddingBottom: 100,
  },
  detailDateLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  overrideNotice: {
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  overrideAvailable: { backgroundColor: colors.successLight },
  overrideBlocked: { backgroundColor: colors.errorLight },
  overrideNoticeText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },

  noJobs: { paddingVertical: spacing.lg, alignItems: 'center' },
  noJobsText: { ...typography.body, color: colors.textTertiary },

  jobCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  jobStatusBar: {
    width: 4,
    borderRadius: 2,
    marginRight: spacing.md,
  },
  jobInfo: { flex: 1 },
  jobTime: { ...typography.bodySmall, color: colors.secondary, fontWeight: '700' },
  jobService: { ...typography.body, color: colors.text, fontWeight: '600', marginTop: 2 },
  jobCustomer: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  jobAddress: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  jobMeta: { alignItems: 'flex-end', justifyContent: 'space-between' },
  jobPrice: { ...typography.body, color: colors.text, fontWeight: '700' },
  jobStatus: { ...typography.caption, color: colors.textSecondary, textTransform: 'capitalize' },
});
