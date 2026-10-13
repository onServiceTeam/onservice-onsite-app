import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { UpdateReasons, UpdateRecoveryActions } from '@/components/ApkUpdateHelp';
import {
  decideUpdate, fetchAndroidRelease, formatMegabytes, installedVersion, isUpdatableApp, type AndroidRelease,
} from '@/services/app-update.service';
import { activeUpdateRelease, notFinishedBody, UPDATE_COPY, useApkUpdater } from '@/hooks/useApkUpdater';
import { colors, spacing, typography } from '@/config/theme';

/**
 * "Installed app" line plus a manual "Check for updates" (Ken's standing
 * requirement for the tester APK). Shown only in the installed Android app;
 * the web app is always the current version.
 *
 * HA-UPD (2026-10-13): "Download update" uses the same in-app installer and
 * the same steps as the start-up pop-up (shared useApkUpdater), in a compact
 * form, and every failure shows a message instead of failing silently. The
 * download keeps going if the person leaves this screen; coming back shows it.
 */
export default function AppVersionCheck(): React.ReactElement | null {
  const [state, setState] = useState<'idle' | 'checking' | 'current' | 'none' | 'failed'>('idle');
  // An update still in progress (started here or in the pop-up) shows straight away.
  const [release, setRelease] = useState<AndroidRelease | null>(() => activeUpdateRelease());
  const updater = useApkUpdater(release);
  if (!isUpdatableApp()) return null;
  const installed = installedVersion();

  const check = async (): Promise<void> => {
    setState('checking');
    setRelease(null);
    try {
      const latest = await fetchAndroidRelease();
      if (!latest) { setState('none'); return; }
      const decision = decideUpdate(installed, latest);
      if (decision.kind === 'available') { setRelease(decision.release); setState('idle'); }
      else setState('current');
    } catch {
      setState('failed');
    }
  };

  let update: React.ReactNode = null;
  if (release) {
    const { phase } = updater;
    if (phase === 'downloading') {
      update = (
        <>
          <Text style={styles.message} accessibilityRole="progressbar">
            Downloading update: {updater.percent}% ({formatMegabytes(updater.received)} of {formatMegabytes(updater.total)})
          </Text>
          <Button title="Cancel" variant="outline" size="sm" onPress={updater.cancel} />
        </>
      );
    } else if (phase === 'verifying') {
      update = <Text style={styles.message}>{UPDATE_COPY.checkingTitle}. {UPDATE_COPY.checkingBody}</Text>;
    } else if (phase === 'opening') {
      update = <Text style={styles.message}>{UPDATE_COPY.openingTitle}. {UPDATE_COPY.openingBody}</Text>;
    } else if (phase === 'restart-needed') {
      update = (
        <>
          <Text style={styles.message} accessibilityRole="alert">{UPDATE_COPY.restartTitle}.</Text>
          <Text style={styles.message}>{UPDATE_COPY.restartBody}</Text>
          <UpdateRecoveryActions updater={updater} showAllowInstalls={false} size="sm" />
        </>
      );
    } else if (phase === 'not-finished') {
      update = (
        <>
          <Text style={styles.message} accessibilityRole="alert">{UPDATE_COPY.notFinishedTitle}.</Text>
          <Text style={styles.message}>{notFinishedBody(installed.versionName, release.versionName)}</Text>
          <UpdateReasons />
          <Button title="Try again" size="sm" onPress={updater.start} />
          <UpdateRecoveryActions updater={updater} showAllowInstalls size="sm" />
        </>
      );
    } else {
      const retry = phase === 'error' || updater.previousAttemptUnfinished;
      update = (
        <>
          <Text style={styles.message} accessibilityRole="alert">Version {release.versionName} is available.</Text>
          {updater.previousAttemptUnfinished ? (
            <>
              <Text style={styles.message}>{UPDATE_COPY.lastNotFinished}</Text>
              <UpdateReasons />
            </>
          ) : null}
          {updater.error ? <Text style={styles.error} accessibilityRole="alert">{updater.error}</Text> : null}
          <Button title={retry ? 'Try again' : 'Download update'} onPress={updater.start} />
          {retry
            ? <UpdateRecoveryActions updater={updater} showAllowInstalls={updater.previousAttemptUnfinished} size="sm" />
            : null}
        </>
      );
    }
  }

  return (
    <View style={styles.container} testID="app-version-check">
      <Text style={styles.version}>
        Installed app: version {installed.versionName ?? '?'} (build {installed.versionCode})
      </Text>
      {release ? update : (
        <Button title="Check for updates" variant="outline" loading={state === 'checking'} onPress={() => { void check(); }} />
      )}
      {state === 'current' ? <Text style={styles.message}>You have the latest version.</Text> : null}
      {state === 'none' ? <Text style={styles.message}>No update has been published yet.</Text> : null}
      {state === 'failed' ? <Text style={styles.error}>Couldn't check for updates. Check your connection and try again.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, alignItems: 'stretch', paddingVertical: spacing.base },
  version: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  message: { ...typography.bodySmall, color: colors.text, textAlign: 'center' },
  error: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
});
