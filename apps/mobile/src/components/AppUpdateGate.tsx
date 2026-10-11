import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { storage } from '@/services/api';
import {
  decideUpdate, fetchAndroidRelease, formatMegabytes, installedVersion, isUpdatableApp, openReleaseDownload,
  type AndroidRelease,
} from '@/services/app-update.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

/**
 * Offers a newer signed APK when the app opens and whenever it returns to the
 * front (at most every 30 minutes). "Later" hides that version for a day,
 * unless this build is below the server's minimum, in which case updating is
 * required. A failed or offline check never blocks the app and never claims it
 * is up to date. Android only; the web app is always current.
 */

const CHECK_EVERY_MS = 30 * 60_000;
const SNOOZE_MS = 24 * 60 * 60_000;
const snoozeKey = (versionCode: number): string => `appUpdate.snoozedUntil.${versionCode}`;

function snoozedUntil(versionCode: number): number {
  try {
    return Number(storage.getString(snoozeKey(versionCode)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export default function AppUpdateGate(): React.ReactElement | null {
  const enabled = Platform.OS === 'android' && isUpdatableApp();
  const [offer, setOffer] = useState<{ release: AndroidRelease; required: boolean } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const lastCheck = useRef(0);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (!enabled || inFlight.current || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    inFlight.current = true;
    lastCheck.current = Date.now();
    try {
      const decision = decideUpdate(installedVersion(), await fetchAndroidRelease());
      if (decision.kind !== 'available') { setOffer(null); return; }
      if (!decision.required && snoozedUntil(decision.release.versionCode) > Date.now()) return;
      setOffer({ release: decision.release, required: decision.required });
    } catch {
      // Offline or a bad answer: try again on the next return to the app.
      lastCheck.current = 0;
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [enabled, check]);

  if (!enabled || !offer) return null;
  const { release, required } = offer;

  const later = (): void => {
    try { storage.set(snoozeKey(release.versionCode), String(Date.now() + SNOOZE_MS)); } catch { /* best effort */ }
    setOffer(null);
  };
  const update = async (): Promise<void> => {
    setOpening(true);
    setOpenError('');
    try {
      await openReleaseDownload(release);
    } catch {
      setOpenError("We couldn't open the download. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={required ? () => undefined : later}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
          <Text style={styles.title}>{required ? 'Update required' : 'Update available'}</Text>
          <Text style={styles.body}>
            {required
              ? `This version of onService PH is no longer supported. Please install version ${release.versionName} to continue.`
              : `Version ${release.versionName} of onService PH is ready (${formatMegabytes(release.size)}). Your account and data stay on this phone.`}
          </Text>
          {release.notes ? <Text style={styles.notes}>{release.notes}</Text> : null}
          <Text style={styles.help}>
            Tap Update, open the downloaded file, then tap Install. If Android asks, allow installs from your browser.
          </Text>
          {openError ? <Text style={styles.error} accessibilityRole="alert">{openError}</Text> : null}
          <Button title="Update" onPress={() => { void update(); }} loading={opening} />
          {!required ? <Button title="Later" variant="ghost" onPress={later} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.base,
    maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { ...typography.h2, color: colors.text },
  body: { ...typography.body, color: colors.text },
  notes: { ...typography.bodySmall, color: colors.textSecondary },
  help: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.bodySmall, color: colors.error },
});
