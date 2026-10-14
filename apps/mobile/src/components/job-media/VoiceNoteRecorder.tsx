/**
 * D38 Milestone 2: record a voice note (job request form and chat composer).
 *
 * Tap to record, tap to stop; it stops by itself at the limit. When the
 * microphone is unavailable (the website, until the server allows it) or
 * refused, it says so plainly instead of failing silently.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVoiceNoteRecorder, type VoiceRecording } from '@/hooks/useVoiceNoteRecorder';
import { formatClock } from '@/utils/duration';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Mic, Square } from '@/components/icons';

export interface VoiceNoteRecorderProps {
  maxSeconds: number;
  onRecorded: (recording: VoiceRecording) => void;
  /** Accent colour (customer blue or provider blue). */
  accent?: string;
  disabled?: boolean;
  /** Shown on the start button, e.g. "Record a voice note". */
  startLabel?: string;
}

export function VoiceNoteRecorder({
  maxSeconds,
  onRecorded,
  accent = colors.primary,
  disabled = false,
  startLabel = 'Record a voice note',
}: VoiceNoteRecorderProps): React.ReactElement {
  const voice = useVoiceNoteRecorder({ maxSeconds, onRecorded });
  const recording = voice.state === 'recording' || voice.state === 'stopping';
  const busy = voice.state === 'starting' || voice.state === 'stopping';

  if (voice.state === 'unavailable') {
    return (
      <View style={styles.notice} accessibilityLabel="Voice notes unavailable here">
        <Mic size={18} color={colors.textTertiary} />
        <Text style={styles.noticeText}>{voice.message}</Text>
      </View>
    );
  }

  return (
    <View>
      {recording ? (
        <View style={styles.recordingRow}>
          <View style={styles.dot} />
          <Text style={styles.timer} accessibilityLiveRegion="polite">
            {`Recording ${formatClock(voice.elapsedMs)} of ${formatClock(voice.maxMs)}`}
          </Text>
          <TouchableOpacity
            style={[styles.stopButton, { borderColor: accent }]}
            onPress={() => { void voice.stop(); }}
            disabled={voice.state === 'stopping'}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            accessibilityState={{ disabled: voice.state === 'stopping', busy: voice.state === 'stopping' }}
          >
            <Square size={16} color={accent} />
            <Text style={[styles.stopText, { color: accent }]}>Stop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.startButton, { borderColor: accent }, (disabled || busy) && styles.disabled]}
          onPress={() => { void voice.start(); }}
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityLabel={startLabel}
          accessibilityHint={`Records up to ${maxSeconds} seconds`}
          accessibilityState={{ disabled: disabled || busy, busy }}
        >
          <Mic size={18} color={accent} />
          <Text style={[styles.startText, { color: accent }]}>{`${startLabel} (up to ${maxSeconds} s)`}</Text>
        </TouchableOpacity>
      )}
      {voice.message && (voice.state === 'denied' || voice.state === 'error') ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">{voice.message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  startButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  startText: { ...typography.body, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  timer: { ...typography.body, color: colors.text, flex: 1 },
  stopButton: {
    minHeight: 44,
    minWidth: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  stopText: { ...typography.body, fontWeight: '700' },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.sm, lineHeight: 18 },
});

export default VoiceNoteRecorder;
