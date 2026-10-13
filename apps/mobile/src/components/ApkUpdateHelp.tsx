import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { browserHelpText, browserOpenedText, UPDATE_COPY, type ApkUpdater } from '@/hooks/useApkUpdater';
import { colors, spacing, typography } from '@/config/theme';

/**
 * The "why did the update not finish" help and its buttons (HA-UPD). Shared by
 * the start-up pop-up and the Help/Settings version row so both explain the
 * same reasons in the same words. The pop-up places the text pieces in its
 * scroll area and the buttons in its fixed footer; the version row uses
 * UpdateRecoveryActions, which keeps them together.
 */

export function UpdateReasons(): React.ReactElement {
  return (
    <View style={styles.reasons}>
      <Text style={styles.text}>{UPDATE_COPY.reasonsIntro}</Text>
      {UPDATE_COPY.reasons.map(reason => (
        <View key={reason} style={styles.reasonRow}>
          <Text style={styles.bullet}>{'•'}</Text>
          <Text style={[styles.text, styles.reasonText]}>{reason}</Text>
        </View>
      ))}
    </View>
  );
}

interface ButtonsProps {
  updater: ApkUpdater;
  /** Show the Allow installs button (only when the install itself did not finish). */
  showAllowInstalls: boolean;
  size?: 'sm' | 'md';
}

/** Allow installs and Download in browser instead. */
export function UpdateRecoveryButtons({ updater, showAllowInstalls, size = 'md' }: ButtonsProps): React.ReactElement {
  return (
    <>
      {showAllowInstalls
        ? <Button title="Allow installs" variant="outline" size={size} onPress={updater.allowInstalls} />
        : null}
      <Button title="Download in browser instead" variant="outline" size={size} onPress={updater.downloadInBrowser} />
    </>
  );
}

/** The browser help that names the exact file to open. */
export function BrowserHelpText({ updater }: { updater: ApkUpdater }): React.ReactElement {
  return (
    <Text style={styles.help}>
      {updater.browserOpened ? browserOpenedText(updater.fileName) : browserHelpText(updater.fileName)}
    </Text>
  );
}

/** A failure of Allow installs or the browser button, if any. */
export function UpdateActionError({ updater }: { updater: ApkUpdater }): React.ReactElement | null {
  return updater.actionError
    ? <Text style={styles.error} accessibilityRole="alert">{updater.actionError}</Text>
    : null;
}

/** Allow installs, Download in browser instead, and the browser help, kept together. */
export function UpdateRecoveryActions({ updater, showAllowInstalls, size = 'md' }: ButtonsProps): React.ReactElement {
  return (
    <View style={styles.actions}>
      <UpdateRecoveryButtons updater={updater} showAllowInstalls={showAllowInstalls} size={size} />
      <BrowserHelpText updater={updater} />
      <UpdateActionError updater={updater} />
    </View>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing.xs },
  reasonRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: { ...typography.bodySmall, color: colors.textSecondary },
  reasonText: { flex: 1 },
  text: { ...typography.bodySmall, color: colors.text },
  actions: { gap: spacing.sm },
  help: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.bodySmall, color: colors.error },
});
