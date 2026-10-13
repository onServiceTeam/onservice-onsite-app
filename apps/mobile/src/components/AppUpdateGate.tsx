import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import {
  BrowserHelpText, UpdateActionError, UpdateReasons, UpdateRecoveryButtons,
} from '@/components/ApkUpdateHelp';
import { storage } from '@/services/api';
import {
  decideUpdate, fetchAndroidRelease, formatMegabytes, installedVersion, isUpdatableApp,
  type AndroidRelease,
} from '@/services/app-update.service';
import { notFinishedBody, UPDATE_COPY, useApkUpdater, usePendingUpdateResult } from '@/hooks/useApkUpdater';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

/**
 * Offers a newer signed APK when the app opens and whenever it returns to the
 * front (at most every 30 minutes). "Later" hides that version for a day,
 * unless this build is below the server's minimum, in which case updating is
 * required. A failed or offline check never blocks the app and never claims it
 * is up to date. Android only; the web app is always current.
 *
 * HA-UPD (2026-10-13): Update now downloads and checks the APK inside the app
 * and opens Android's installer, with clear steps on screen (Downloading,
 * Checking the file, Opening the installer) and an honest "did not finish"
 * screen when the person comes back still on the old build. On the next start
 * after a successful install it says "Updated to version X" once.
 *
 * The card has a height limit: its text scrolls and its buttons sit in a
 * footer that never scrolls away, so the long "did not finish" help stays
 * usable on small phones and with large text.
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

function UpdateCard({ body, actions }: { body: React.ReactNode; actions?: React.ReactNode }): React.ReactElement {
  return (
    <View style={styles.backdrop}>
      <View style={styles.card} testID="app-update-card" accessibilityViewIsModal accessibilityRole="alert">
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} testID="app-update-scroll">
          {body}
        </ScrollView>
        {actions ? <View style={styles.actions} testID="app-update-actions">{actions}</View> : null}
      </View>
    </View>
  );
}

export default function AppUpdateGate(): React.ReactElement | null {
  const enabled = Platform.OS === 'android' && isUpdatableApp();
  const [offer, setOffer] = useState<{ release: AndroidRelease; required: boolean } | null>(null);
  const lastCheck = useRef(0);
  const inFlight = useRef(false);
  const updater = useApkUpdater(offer?.release ?? null);
  const { updatedTo, dismiss } = usePendingUpdateResult(enabled);

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

  if (!enabled) return null;

  if (updatedTo) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
        <UpdateCard
          body={(
            <>
              <Text style={styles.title}>Updated to version {updatedTo}</Text>
              <Text style={styles.body}>The update is installed. Your account and data stay on this phone.</Text>
            </>
          )}
          actions={<Button title="OK" onPress={dismiss} />}
        />
      </Modal>
    );
  }

  if (!offer) return null;
  const { release, required } = offer;
  const { phase } = updater;
  const busy = phase === 'downloading' || phase === 'verifying' || phase === 'opening';

  const later = (): void => {
    try { storage.set(snoozeKey(release.versionCode), String(Date.now() + SNOOZE_MS)); } catch { /* best effort */ }
    setOffer(null);
  };
  const laterButton = !required ? <Button title="Later" variant="ghost" onPress={later} /> : null;

  let body: React.ReactNode;
  let actions: React.ReactNode = null;
  if (phase === 'downloading') {
    body = (
      <>
        <Text style={styles.title}>{UPDATE_COPY.downloadingTitle}</Text>
        <Text style={styles.body}>Version {release.versionName}: {updater.percent}%</Text>
        <View style={styles.track} accessibilityRole="progressbar"
          accessibilityLabel={`Download progress ${updater.percent} percent`}>
          <View style={[styles.fill, { width: `${updater.percent}%` }]} />
        </View>
        <Text style={styles.notes}>
          {formatMegabytes(updater.received)} of {formatMegabytes(updater.total)}
        </Text>
      </>
    );
    actions = <Button title="Cancel" variant="outline" onPress={updater.cancel} />;
  } else if (phase === 'verifying') {
    body = (
      <>
        <Text style={styles.title}>{UPDATE_COPY.checkingTitle}</Text>
        <Text style={styles.body}>{UPDATE_COPY.checkingBody}</Text>
      </>
    );
  } else if (phase === 'opening') {
    body = (
      <>
        <Text style={styles.title}>{UPDATE_COPY.openingTitle}</Text>
        <Text style={styles.body}>{UPDATE_COPY.openingBody}</Text>
      </>
    );
  } else if (phase === 'not-finished') {
    body = (
      <>
        <Text style={styles.title}>{UPDATE_COPY.notFinishedTitle}</Text>
        <Text style={styles.body}>{notFinishedBody(installedVersion().versionName, release.versionName)}</Text>
        <UpdateReasons />
        <BrowserHelpText updater={updater} />
      </>
    );
    actions = (
      <>
        <UpdateActionError updater={updater} />
        <Button title="Try again" onPress={updater.start} />
        <UpdateRecoveryButtons updater={updater} showAllowInstalls size="sm" />
        {laterButton}
      </>
    );
  } else if (phase === 'restart-needed') {
    // Android still holds the last installer, so it would refuse to open the
    // installer or the settings screen again: only the browser is offered.
    body = (
      <>
        <Text style={styles.title}>{UPDATE_COPY.restartTitle}</Text>
        <Text style={styles.body}>{UPDATE_COPY.restartBody}</Text>
        <BrowserHelpText updater={updater} />
      </>
    );
    actions = (
      <>
        <UpdateActionError updater={updater} />
        <UpdateRecoveryButtons updater={updater} showAllowInstalls={false} size="sm" />
        {laterButton}
      </>
    );
  } else {
    // idle or error: the offer itself.
    const retry = phase === 'error' || updater.previousAttemptUnfinished;
    body = (
      <>
        <Text style={styles.title}>{required ? 'Update required' : 'Update available'}</Text>
        <Text style={styles.body}>
          {required
            ? `This version of onService PH is no longer supported. Please install version ${release.versionName} to continue.`
            : `Version ${release.versionName} of onService PH is ready (${formatMegabytes(release.size)}). Your account and data stay on this phone.`}
        </Text>
        {release.notes ? <Text style={styles.notes}>{release.notes}</Text> : null}
        {updater.previousAttemptUnfinished ? (
          <>
            <Text style={styles.warning}>{UPDATE_COPY.lastNotFinished}</Text>
            <UpdateReasons />
          </>
        ) : <Text style={styles.help}>{UPDATE_COPY.howItWorks}</Text>}
        {retry ? <BrowserHelpText updater={updater} /> : null}
      </>
    );
    actions = (
      <>
        {updater.error ? <Text style={styles.error} accessibilityRole="alert">{updater.error}</Text> : null}
        <UpdateActionError updater={updater} />
        <Button title={retry ? 'Try again' : 'Update'} onPress={updater.start} />
        {retry
          ? <UpdateRecoveryButtons updater={updater} showAllowInstalls={updater.previousAttemptUnfinished} size="sm" />
          : null}
        {laterButton}
      </>
    );
  }

  return (
    <Modal visible transparent animationType="fade"
      onRequestClose={required || busy ? () => undefined : later}>
      <UpdateCard body={body} actions={actions} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', padding: spacing.lg },
  // maxHeight keeps the card on screen; the scroll area shrinks to fit and the
  // footer below it keeps its natural height.
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.base,
    maxWidth: 480, width: '100%', maxHeight: '90%', alignSelf: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: spacing.base },
  actions: { gap: spacing.sm },
  title: { ...typography.h2, color: colors.text },
  body: { ...typography.body, color: colors.text },
  notes: { ...typography.bodySmall, color: colors.textSecondary },
  help: { ...typography.caption, color: colors.textTertiary },
  warning: { ...typography.body, fontWeight: '600', color: colors.error },
  error: { ...typography.bodySmall, color: colors.error },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary },
});
