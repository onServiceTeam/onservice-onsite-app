/**
 * D38 Milestone 2 (package P5b): the earliest date and time window a pro
 * can start, for the quote form.
 *
 * Dates run from today to today + 30 on the Manila calendar, the range the
 * server admits (packages/api services/booking/quote-slot.ts). Windows are
 * morning (8 AM to 12 PM), afternoon (12 PM to 5 PM) and evening (5 PM to
 * 9 PM); "As soon as possible" is offered for today only. For today, a
 * window that has already ended is not offered. The server still checks
 * every slot (a window that ends too soon for the customer to confirm is
 * refused with QUOTE_SLOT_INVALID, which the quote form explains).
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import {
  TIME_WINDOWS,
  TIME_WINDOW_HOURS,
  addDaysToDateKey,
  manilaDateKey,
  manilaMinutesOfDay,
  relativeDateLabel,
  shortDateLabel,
  timeWindowLabel,
  type QuoteTimeWindow,
} from '@/services/request.service';

/** The furthest earliest date a pro may offer, in days after today (server rule). */
export const QUOTE_SLOT_MAX_DAYS_AHEAD = 30;

export interface QuoteSlot {
  /** YYYY-MM-DD on the Manila calendar. */
  date: string;
  window: QuoteTimeWindow;
}

export interface QuoteSlotPickerProps {
  value: { date: string | null; window: QuoteTimeWindow | null };
  onChange: (next: { date: string | null; window: QuoteTimeWindow | null }) => void;
  disabled?: boolean;
  /** For tests and previews; defaults to the device clock. */
  nowMs?: number;
}

/** The windows a pro may offer on `date`, given the Manila clock now. */
export function windowsForDate(date: string, nowMs: number = Date.now()): QuoteTimeWindow[] {
  const today = manilaDateKey(nowMs);
  if (date !== today) return TIME_WINDOWS.filter((window) => window !== 'asap');
  const minutesNow = manilaMinutesOfDay(nowMs);
  return TIME_WINDOWS.filter((window) => minutesNow < TIME_WINDOW_HOURS[window].end * 60);
}

/** Today to today + 30 (Manila), leaving out today when no window is left. */
export function slotDates(nowMs: number = Date.now()): string[] {
  const today = manilaDateKey(nowMs);
  const dates: string[] = [];
  for (let offset = 0; offset <= QUOTE_SLOT_MAX_DAYS_AHEAD; offset += 1) {
    const date = addDaysToDateKey(today, offset);
    if (offset === 0 && windowsForDate(date, nowMs).length === 0) continue;
    dates.push(date);
  }
  return dates;
}

export function QuoteSlotPicker({ value, onChange, disabled = false, nowMs }: QuoteSlotPickerProps): React.ReactElement {
  const now = nowMs ?? Date.now();
  const dates = useMemo(() => slotDates(now), [now]);
  const windows = value.date ? windowsForDate(value.date, now) : [];

  const chooseDate = (date: string): void => {
    // A window that does not exist on the new date (ASAP away from today, or
    // a window already over today) is cleared so it cannot be sent.
    const keep = value.window && windowsForDate(date, now).includes(value.window) ? value.window : null;
    onChange({ date, window: keep });
  };

  return (
    <View style={styles.container} accessibilityLabel="Earliest date and time window">
      <Text style={styles.label}>Earliest date you can start</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
        {dates.map((date) => {
          const selected = value.date === date;
          const relative = relativeDateLabel(date, now);
          const name = relative === 'Today' || relative === 'Tomorrow'
            ? `${relative}, ${shortDateLabel(date)}`
            : shortDateLabel(date);
          return (
            <TouchableOpacity
              key={date}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => chooseDate(date)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityState={{ selected, disabled }}
            >
              <Text style={[styles.chipTitle, selected && styles.chipTextSelected]}>
                {relative === 'Today' || relative === 'Tomorrow' ? relative : shortDateLabel(date).split(' ')[0]}
              </Text>
              <Text style={[styles.chipSub, selected && styles.chipTextSelected]}>
                {shortDateLabel(date).split(' ').slice(1).join(' ')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Time window</Text>
      {!value.date ? (
        <Text style={styles.hint}>Choose a date first.</Text>
      ) : (
        <View style={styles.windowList}>
          {windows.map((window) => {
            const selected = value.window === window;
            const label = window === 'asap' ? 'As soon as possible (today only)' : timeWindowLabel(window);
            return (
              <TouchableOpacity
                key={window}
                style={[styles.windowOption, selected && styles.windowOptionSelected]}
                onPress={() => onChange({ date: value.date, window })}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected, disabled }}
              >
                <View style={[styles.radio, selected && styles.radioSelected]} />
                <Text style={[styles.windowText, selected && styles.windowTextSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  hint: { ...typography.caption, color: colors.textSecondary },
  dateRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    minWidth: 72,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  chipSub: { ...typography.caption, color: colors.textSecondary },
  chipTextSelected: { color: colors.white },
  windowList: { gap: spacing.xs },
  windowOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  windowOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  windowText: { ...typography.bodySmall, color: colors.text },
  windowTextSelected: { fontWeight: '700', color: colors.primary },
});

export default QuoteSlotPicker;
