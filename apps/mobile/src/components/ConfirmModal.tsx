/**
 * Phase 14 Dispatch 11 — Pattern 14: confirmation modal for destructive actions.
 *
 * Wraps destructive operations (cancel booking, delete card, sign out, etc.)
 * with a two-step confirmation that includes the Android hardwareBackPress
 * dismissal path (Pattern 13). Used throughout customer screens — see
 * Part 2B sections 17, 26, 27 for the canonical Bug 998 / Bug 975 chains.
 */

import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps): React.ReactElement {
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (loading) return true;
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, loading, onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                destructive ? styles.destructiveButton : styles.confirmButton,
                loading && styles.disabledButton,
              ]}
              onPress={onConfirm}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ busy: loading, disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  title: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  button: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: { backgroundColor: colors.divider },
  cancelText: { ...typography.button, color: colors.text },
  confirmButton: { backgroundColor: colors.primary },
  destructiveButton: { backgroundColor: colors.error },
  confirmText: { ...typography.button, color: colors.white },
  disabledButton: { opacity: 0.6 },
});

export default ConfirmModal;
