import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import {
  decideUpdate, fetchAndroidRelease, installedVersion, isUpdatableApp, openReleaseDownload, type AndroidRelease,
} from '@/services/app-update.service';
import { colors, spacing, typography } from '@/config/theme';

/**
 * "Installed app" line plus a manual "Check for updates" (Ken's standing
 * requirement for the tester APK). Shown only in the installed Android app;
 * the web app is always the current version.
 */
export default function AppVersionCheck(): React.ReactElement | null {
  const [state, setState] = useState<'idle' | 'checking' | 'current' | 'none' | 'failed'>('idle');
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [opening, setOpening] = useState(false);
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

  return (
    <View style={styles.container} testID="app-version-check">
      <Text style={styles.version}>
        Installed app: version {installed.versionName ?? '?'} (build {installed.versionCode})
      </Text>
      {release ? (
        <>
          <Text style={styles.message} accessibilityRole="alert">Version {release.versionName} is available.</Text>
          <Button title="Download update" loading={opening}
            onPress={() => { setOpening(true); void openReleaseDownload(release).finally(() => setOpening(false)); }} />
        </>
      ) : (
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
