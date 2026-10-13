import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  clearPendingUpdate, installedVersion, openReleaseDownload, pendingUpdateOutcome, releaseFileName,
  savePendingUpdate, type AndroidRelease,
} from '@/services/app-update.service';
import {
  ApkInstallError, NETWORK_MESSAGE, __resetApkInstallerForTests, clearDownloadedUpdates, createDownloadControl,
  installerUriFor, isInstallerBusy, launchApkInstaller, openInstallPermissionSettings, prepareVerifiedApk,
  type ApkDownloadControl,
} from '@/services/apk-installer';

/**
 * One shared state machine for installing an APK update from inside the app
 * (HA-UPD, Ken's human audit 2026-10-13: "1.0.1 keeps saying Update
 * available"). Used by the start-up pop-up (AppUpdateGate) and by the version
 * row on the Help and Settings screens (AppVersionCheck), so both show the
 * same states and words:
 *
 *   idle -> downloading -> verifying -> opening -> (app replaced by Android)
 *                                                -> not-finished
 *                                                -> restart-needed
 *   any step can end in error (with a plain message) or back in idle (Cancel).
 *
 * The run lives in this module, not in a screen: leaving the Help screen does
 * not stop a download, and coming back shows its progress. Only Cancel stops it.
 *
 * A successful install stops and replaces this app, so reaching the end of
 * launchApkInstaller means the person came back and the update did NOT land.
 *
 * restart-needed: Android's installer has not answered. expo-intent-launcher
 * then refuses to open any other screen (installer or settings) until it does,
 * so the only buttons offered are the browser download and "close and reopen".
 */

export type ApkUpdatePhase =
  | 'idle' | 'downloading' | 'verifying' | 'opening' | 'not-finished' | 'restart-needed' | 'error';

export const UPDATE_COPY = {
  howItWorks: "Tap Update. onService downloads the update, checks it, then opens Android's installer. "
    + 'Tap Install or Update when Android asks.',
  downloadingTitle: 'Downloading update',
  checkingTitle: 'Checking the file',
  checkingBody: 'Making sure the download is complete and undamaged.',
  openingTitle: 'Opening the installer',
  openingBody: 'Android will ask you to confirm. Tap Install or Update. When Android finishes, tap Open to start the new version.',
  notFinishedTitle: 'The update did not finish',
  lastNotFinished: 'Your last update did not finish.',
  reasonsIntro: 'This usually happens for one of these reasons:',
  reasons: [
    'Android needs your permission to install updates from onService. Tap Allow installs, turn on '
      + '"Allow from this source", come back here, then tap Try again.',
    "Play Protect or your phone's security scan may ask you to confirm before it installs. Tap Try again "
      + 'and confirm on that screen.',
    'Your phone may not have enough free storage. Free up some space, then tap Try again.',
  ],
  restartTitle: 'Close and reopen onService',
  restartBody: "Android's installer has not told onService whether the update was installed, so onService "
    + 'cannot open it again right now. Close onService completely (swipe it away from your recent apps), open it '
    + 'again, then try the update again. Or download it in your browser instead.',
  restartShort: 'Close onService completely (swipe it away from your recent apps), open it again, then try again.',
  installerFailed: "We couldn't open Android's installer. Tap Try again, or download the update in your browser instead.",
  settingsFailed: "We couldn't open that settings screen. In your phone's Settings, open Apps, then onService, "
    + 'and allow it to install unknown apps.',
  browserFailed: "We couldn't open your browser. Please try again.",
  busy: 'An update is already downloading. Please wait for it to finish.',
} as const;

export function notFinishedBody(installedName: string | null, targetName: string): string {
  return `This phone is still on version ${installedName ?? 'the older build'}. Android did not install version ${targetName}.`;
}

export function browserHelpText(fileName: string): string {
  return 'To download in your browser instead: first delete any older onService APK files from your Downloads '
    + `folder. Then open the file named ${fileName} and tap Install.`;
}

export function browserOpenedText(fileName: string): string {
  return `The download opened in your browser. When it finishes, open ${fileName} and tap Install.`;
}

/** How long to wait, after coming back to the app, for the installer's answer. */
const RETURN_GRACE_MS = 3000;

// ---------------------------------------------------------------------------
// The update run (one per app, shared by every screen that shows it)
// ---------------------------------------------------------------------------

interface UpdateRun {
  /** The release this state is about; null before any update was started. */
  release: AndroidRelease | null;
  phase: ApkUpdatePhase;
  received: number;
  total: number;
  /** The message for the error phase. */
  error: string;
}

const NO_RUN: UpdateRun = { release: null, phase: 'idle', received: 0, total: 0, error: '' };
let run: UpdateRun = NO_RUN;
const listeners = new Set<() => void>();
/** The download (or file check, or installer launch) in progress, if any. */
let control: ApkDownloadControl | null = null;
/** Increases with every new run, so an older run can never overwrite a newer one. */
let runId = 0;
let returnWatch: { remove(): void } | null = null;
let returnTimer: ReturnType<typeof setTimeout> | null = null;

function setRun(next: Partial<UpdateRun>): void {
  run = { ...run, ...next };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function readRun(): UpdateRun {
  return run;
}

const IN_PROGRESS: ReadonlySet<ApkUpdatePhase> = new Set(['downloading', 'verifying', 'opening', 'restart-needed']);

/** The release of an update that is still in progress, so a screen opened later can show it. */
export function activeUpdateRelease(): AndroidRelease | null {
  return IN_PROGRESS.has(run.phase) ? run.release : null;
}

function stopReturnWatch(): void {
  returnWatch?.remove();
  returnWatch = null;
  if (returnTimer) clearTimeout(returnTimer);
  returnTimer = null;
}

/**
 * If the person is back in the app but the installer never answered, do not
 * keep showing "Opening the installer" forever. Its answer may still come (the
 * run then moves on to "did not finish"), but until then Android would refuse
 * to open the installer or the settings screen again.
 */
function watchReturn(id: number, target: AndroidRelease): void {
  stopReturnWatch();
  returnWatch = AppState.addEventListener('change', state => {
    if (state !== 'active') return;
    if (returnTimer) clearTimeout(returnTimer);
    returnTimer = setTimeout(() => {
      returnTimer = null;
      if (id !== runId || run.phase !== 'opening') return;
      const now = installedVersion().versionCode;
      if (now !== null && now >= target.versionCode) return;
      stopReturnWatch();
      control = null;
      setRun({ phase: 'restart-needed', error: '' });
    }, RETURN_GRACE_MS);
  });
}

type StartResult = 'started' | 'already-running' | 'busy-with-other-version';

function startUpdate(target: AndroidRelease): StartResult {
  if (control) {
    return run.release?.versionCode === target.versionCode ? 'already-running' : 'busy-with-other-version';
  }
  if (isInstallerBusy()) {
    // An earlier installer has not answered; opening another one would fail.
    setRun({ release: target, phase: 'restart-needed', received: 0, total: target.size, error: '' });
    return 'started';
  }
  const ctl = createDownloadControl();
  control = ctl;
  const id = ++runId;
  const current = (): boolean => id === runId;
  const done = (): void => { if (control === ctl) control = null; };
  setRun({ release: target, phase: 'downloading', received: 0, total: target.size, error: '' });

  void (async () => {
    let fileUri: string;
    try {
      ({ uri: fileUri } = await prepareVerifiedApk(target, {
        control: ctl,
        onProgress: next => { if (current()) setRun(next); },
        onVerifying: () => { if (current()) setRun({ phase: 'verifying' }); },
      }));
    } catch (failure) {
      done();
      if (!current()) return;
      if (failure instanceof ApkInstallError && failure.code === 'cancelled') setRun({ phase: 'idle' });
      else setRun({ phase: 'error', error: failure instanceof ApkInstallError ? failure.message : NETWORK_MESSAGE });
      return;
    }
    if (!current() || ctl.cancelled) { done(); return; }
    setRun({ phase: 'opening' });

    let contentUri: string;
    try {
      contentUri = await installerUriFor(fileUri);
    } catch {
      done();
      if (current()) setRun({ phase: 'error', error: UPDATE_COPY.installerFailed });
      return;
    }
    if (!current()) { done(); return; }
    if (isInstallerBusy()) {
      done();
      setRun({ phase: 'restart-needed', error: '' });
      return;
    }
    // Saved BEFORE the installer opens: if the install works, Android stops
    // this app and the next start reads this record.
    savePendingUpdate({ targetVersionCode: target.versionCode, versionName: target.versionName, startedAt: Date.now() });
    watchReturn(id, target);
    try {
      await launchApkInstaller(contentUri);
    } catch (failure) {
      done();
      if (current()) stopReturnWatch();
      if (failure instanceof ApkInstallError && failure.code === 'busy') {
        // Android still holds an earlier installer, which may yet finish the
        // install, so the record is kept for the next start to check.
        if (current()) setRun({ release: target, phase: 'restart-needed', error: '' });
        return;
      }
      // The installer never opened, so nothing is pending.
      clearPendingUpdate();
      if (current()) setRun({ release: target, phase: 'error', error: UPDATE_COPY.installerFailed });
      return;
    }
    done();
    if (!current()) return;
    stopReturnWatch();
    const now = installedVersion().versionCode;
    if (now !== null && now >= target.versionCode) {
      clearPendingUpdate();
      setRun({ release: target, phase: 'idle', error: '' });
    } else {
      // Still the old build: the installer closed without installing.
      setRun({ release: target, phase: 'not-finished', error: '' });
    }
  })();
  return 'started';
}

function cancelUpdate(): void {
  const running = control;
  if (running) void running.cancel();
}

/** Tests only: start every test from no update at all. */
export function __resetApkUpdaterForTests(): void {
  stopReturnWatch();
  runId += 1;
  control = null;
  run = NO_RUN;
  __resetApkInstallerForTests();
  listeners.forEach(listener => listener());
}

// ---------------------------------------------------------------------------
// The hook each screen uses
// ---------------------------------------------------------------------------

export interface ApkUpdater {
  phase: ApkUpdatePhase;
  /** Bytes downloaded so far and the total, while downloading. */
  received: number;
  total: number;
  percent: number;
  /** The message for the error phase. */
  error: string;
  /** A failure of a secondary button (Allow installs, browser). */
  actionError: string;
  browserOpened: boolean;
  /** The pending record says an earlier attempt did not land. */
  previousAttemptUnfinished: boolean;
  /** The exact APK file name, for help text. */
  fileName: string;
  /** Download (or reuse a verified file), check it and open the installer. */
  start: () => void;
  cancel: () => void;
  allowInstalls: () => void;
  downloadInBrowser: () => void;
}

export function useApkUpdater(release: AndroidRelease | null): ApkUpdater {
  const shared = useSyncExternalStore(subscribe, readRun, readRun);
  const [localError, setLocalError] = useState('');
  const [actionError, setActionError] = useState('');
  const [browserOpened, setBrowserOpened] = useState(false);
  const mounted = useRef(true);
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const versionCode = release?.versionCode ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // A different release (or none) starts this screen's messages afresh.
  useEffect(() => {
    setLocalError('');
    setActionError('');
    setBrowserOpened(false);
  }, [versionCode]);

  // The shared run counts only when it is about this screen's release.
  const mine = versionCode !== null && shared.release?.versionCode === versionCode;
  const phase: ApkUpdatePhase = mine ? shared.phase : (localError ? 'error' : 'idle');

  const start = useCallback(() => {
    const target = releaseRef.current;
    if (!target) return;
    setLocalError('');
    setActionError('');
    setBrowserOpened(false);
    if (startUpdate(target) === 'busy-with-other-version') setLocalError(UPDATE_COPY.busy);
  }, []);

  const cancel = useCallback(() => { cancelUpdate(); }, []);

  const allowInstalls = useCallback(() => {
    setActionError('');
    void openInstallPermissionSettings().catch(failure => {
      if (!mounted.current) return;
      setActionError(failure instanceof ApkInstallError && failure.code === 'busy'
        ? UPDATE_COPY.restartShort
        : UPDATE_COPY.settingsFailed);
    });
  }, []);

  const downloadInBrowser = useCallback(() => {
    const target = releaseRef.current;
    if (!target) return;
    setActionError('');
    openReleaseDownload(target).then(
      () => { if (mounted.current) setBrowserOpened(true); },
      () => { if (mounted.current) setActionError(UPDATE_COPY.browserFailed); },
    );
  }, []);

  const previousAttemptUnfinished = useMemo(
    () => versionCode !== null && (phase === 'idle' || phase === 'error')
      && pendingUpdateOutcome(installedVersion()).kind === 'unfinished',
    [versionCode, phase],
  );

  const received = mine ? shared.received : 0;
  const total = mine && shared.total > 0 ? shared.total : (release?.size ?? 0);
  return {
    phase,
    received,
    total,
    percent: total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0,
    error: mine ? shared.error : localError,
    actionError,
    browserOpened,
    previousAttemptUnfinished,
    fileName: release ? releaseFileName(release) : '',
    start,
    cancel,
    allowInstalls,
    downloadInBrowser,
  };
}

/**
 * On app start: if the last install landed, report the new version once and
 * clear the record and the downloaded file. A record for an update that has
 * not landed is kept, so the next offer can say it did not finish.
 */
export function usePendingUpdateResult(enabled: boolean): { updatedTo: string | null; dismiss: () => void } {
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const outcome = pendingUpdateOutcome(installedVersion());
    if (outcome.kind !== 'updated') return;
    clearPendingUpdate();
    void clearDownloadedUpdates().catch(() => undefined);
    setUpdatedTo(outcome.versionName);
  }, [enabled]);
  const dismiss = useCallback(() => setUpdatedTo(null), []);
  return { updatedTo, dismiss };
}
