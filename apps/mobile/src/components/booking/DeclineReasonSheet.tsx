/**
 * D38 Milestone 2 (package P5b): declining a quote needs a reason (D38,
 * merged plan conflict 6): price too high, timing does not work, changed my
 * mind, or other, with an optional note of up to 300 characters.
 *
 * The pro is told the reason (as a short label), never the note; the note
 * stays with onService (packages/api declineQuote stores it for the back
 * office only). A plain Modal with real buttons, so it works the same on the
 * web app, where Alert.alert does nothing useful.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { DECLINE_REASON_OPTIONS, type DeclineReason } from '@/services/request.service';

export const DECLINE_NOTE_MAX = 300;

export interface DeclineReasonSheetProps {
  visible: boolean;
  providerName?: string | null;
  loading?: boolean;
  onSubmit: (input: { reason: DeclineReason; note?: string }) => void;
  onCancel: () => void;
}

export function DeclineReasonSheet({
  visible,
  providerName,
  loading = false,
  onSubmit,
  onCancel,
}: DeclineReasonSheetProps): React.ReactElement {
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const [note, setNote] = useState('');

  // A fresh choice every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
    }
  }, [visible]);

  const submit = (): void => {
    if (!reason || loading) return;
    const trimmed = note.trim();
    onSubmit(trimmed ? { reason, note: trimmed } : { reason });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityLabel="Decline this quote">
          <Text style={styles.title} accessibilityRole="header">Why are you declining?</Text>
          <Text style={styles.subtitle}>
            {`Choose a reason. ${providerName ? `${providerName} is` : 'The pro is'} told the reason you pick. Your note stays with onService and is not shown to pros.`}
          </Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {DECLINE_REASON_OPTIONS.map((option) => {
              const selected = reason === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setReason(option.value)}
                  disabled={loading}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected, checked: selected }}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.noteLabel}>Note for onService (optional)</Text>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={DECLINE_NOTE_MAX}
            placeholder="Anything our team should know"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Note for onService"
            editable={!loading}
          />
          <Text style={styles.counter}>{`${note.length}/${DECLINE_NOTE_MAX}`}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Keep this quote"
            >
              <Text style={styles.cancelText}>Keep this quote</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.declineBtn, (!reason || loading) && styles.disabled]}
              onPress={submit}
              disabled={!reason || loading}
              accessibilityRole="button"
              accessibilityLabel="Decline quote"
              accessibilityState={{ disabled: !reason || loading, busy: loading }}
            >
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.declineText}>Decline quote</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,26,62,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  options: { gap: spacing.xs, marginTop: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { ...typography.body, color: colors.text },
  optionTextSelected: { fontWeight: '700', color: colors.primary },
  noteLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  note: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.text,
  },
  counter: { ...typography.caption, color: colors.textTertiary, alignSelf: 'flex-end' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: { flex: 1, minHeight: 48, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.button, color: colors.text },
  declineBtn: { flex: 1, minHeight: 48, borderRadius: borderRadius.lg, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  declineText: { ...typography.button, color: colors.white },
  disabled: { opacity: 0.5 },
});

export default DeclineReasonSheet;
