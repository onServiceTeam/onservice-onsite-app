// apps/mobile/src/components/ui/AlertHost.tsx
//
// Phase 200 — renders the web Alert shim (see src/utils/web-alert.ts) as an
// on-brand modal. Mounted once at the app root. On native this renders nothing
// meaningful because the store is never populated (the OS Alert is used).
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useWebAlertStore, type WebAlertButton } from '@/utils/web-alert';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export function AlertHost(): React.ReactElement {
  const visible = useWebAlertStore((s) => s.visible);
  const title = useWebAlertStore((s) => s.title);
  const message = useWebAlertStore((s) => s.message);
  const buttons = useWebAlertStore((s) => s.buttons);
  const hide = useWebAlertStore((s) => s.hide);

  const onPress = (btn: WebAlertButton): void => {
    hide();
    // Defer the callback so the modal closes before any navigation/side effect.
    setTimeout(() => btn.onPress?.(), 0);
  };

  const cancelButton =
    buttons.find((b) => b.style === 'cancel') ?? null;

  const stacked = buttons.length > 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => (cancelButton ? onPress(cancelButton) : hide())}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => (cancelButton ? onPress(cancelButton) : undefined)}
      >
        {/* Stop propagation so taps inside the card don't dismiss it. */}
        <Pressable style={styles.card} onPress={() => undefined}>
          {title ? (
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <Pressable
                  key={`${btn.text}-${i}`}
                  onPress={() => onPress(btn)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.btn,
                    stacked && styles.btnStacked,
                    isCancel ? styles.btnCancel : styles.btnPrimary,
                    isDestructive && styles.btnDestructive,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.btnText,
                      isCancel ? styles.btnTextCancel : styles.btnTextPrimary,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  title: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  actionsStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  btn: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStacked: { width: '100%' },
  btnPrimary: { backgroundColor: colors.primary },
  btnDestructive: { backgroundColor: colors.error },
  btnCancel: { backgroundColor: colors.divider },
  btnPressed: { opacity: 0.85 },
  btnText: { ...typography.button },
  btnTextPrimary: { color: colors.white },
  btnTextCancel: { color: colors.text },
});

export default AlertHost;
