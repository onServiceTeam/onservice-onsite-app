import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  ANDROID_PACKAGE, formatMegabytes, releaseFileName, type AndroidRelease,
} from '@/services/app-update.service';
import {
  ApkInstallError, DAMAGED_MESSAGE, FREE_SPACE_FACTOR, INSTALLER_BUSY_MESSAGE, NETWORK_MESSAGE, UNAVAILABLE_MESSAGE,
  type PrepareApkOptions, type PreparedApk,
} from './apk-installer.types';

/**
 * In-app APK installer, Android only (HA-UPD, Ken's human audit 2026-10-13).
 * The web build loads apk-installer.web.ts instead, so it never imports the
 * native file-system or intent modules.
 *
 * Steps: download the APK into the app's own cache folder with progress, check
 * its size (and MD5 when the manifest has one), turn it into a content://
 * address Android's installer may read, and open the installer with ACTION_VIEW.
 * Android still asks the person to confirm and still checks the signature, so
 * nothing installs silently and only our signed builds can replace the app.
 */

export * from './apk-installer.types';

export const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const ACTION_VIEW = 'android.intent.action.VIEW';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION: lets the installer read our file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/** cache/updates/ inside the app's private storage. */
export function updatesDirectory(): string {
  const base = FileSystem.cacheDirectory;
  if (!base) throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
  return `${base}updates/`;
}

/** Where a release is saved, for example cache/updates/onService-1.0.3-4.apk. */
export function apkCacheUri(release: Pick<AndroidRelease, 'versionName' | 'versionCode'>): string {
  return `${updatesDirectory()}${releaseFileName(release)}`;
}

/** Make sure the updates folder exists and holds nothing but this release's file. */
async function keepOnly(fileName: string): Promise<void> {
  const dir = updatesDirectory();
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists && !info.isDirectory) await FileSystem.deleteAsync(dir, { idempotent: true });
  if (!info.exists || !info.isDirectory) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return;
  }
  for (const name of await FileSystem.readDirectoryAsync(dir)) {
    if (name !== fileName) await FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true });
  }
}

/** True when the file has exactly the published size (and MD5, when published). */
async function matchesRelease(uri: string, release: AndroidRelease): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || info.size !== release.size) return false;
  if (!release.md5) return true;
  const hashed = await FileSystem.getInfoAsync(uri, { md5: true });
  return hashed.exists && typeof hashed.md5 === 'string' && hashed.md5.toLowerCase() === release.md5;
}

async function remove(uri: string): Promise<void> {
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* nothing to remove */ }
}

/**
 * Returns a verified copy of the release in the cache folder. A file kept from
 * an earlier attempt is reused when it still checks out; otherwise the APK is
 * downloaded again. Throws ApkInstallError with a message for the person.
 */
export async function prepareVerifiedApk(release: AndroidRelease, options: PrepareApkOptions): Promise<PreparedApk> {
  const { control, onProgress, onVerifying } = options;
  const uri = apkCacheUri(release);
  await keepOnly(releaseFileName(release));

  const cached = await FileSystem.getInfoAsync(uri);
  if (cached.exists) {
    onVerifying?.();
    if (await matchesRelease(uri, release)) return { uri, reused: true };
    await remove(uri);
  }

  const free = await FileSystem.getFreeDiskStorageAsync();
  const needed = Math.ceil(release.size * FREE_SPACE_FACTOR);
  if (free < needed) {
    throw new ApkInstallError('space',
      `Not enough free space. This update needs about ${formatMegabytes(needed)} free and your phone has `
      + `${formatMegabytes(Math.max(0, free))}. Free up some space, then try again.`);
  }
  if (control.cancelled) throw new ApkInstallError('cancelled', 'Download cancelled.');

  const task = FileSystem.createDownloadResumable(release.downloadUrl, uri, {}, progress => {
    onProgress?.({
      received: progress.totalBytesWritten,
      total: progress.totalBytesExpectedToWrite > 0 ? progress.totalBytesExpectedToWrite : release.size,
    });
  });
  control.attach(task);
  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await task.downloadAsync();
  } catch {
    await remove(uri);
    if (control.cancelled) throw new ApkInstallError('cancelled', 'Download cancelled.');
    throw new ApkInstallError('network', NETWORK_MESSAGE);
  } finally {
    control.attach(null);
  }
  if (!result || control.cancelled) {
    await remove(uri);
    throw new ApkInstallError('cancelled', 'Download cancelled.');
  }
  // The legacy downloader saves error pages too, so the HTTP status is checked.
  if (result.status < 200 || result.status >= 300) {
    await remove(uri);
    throw new ApkInstallError('network', NETWORK_MESSAGE);
  }

  onVerifying?.();
  if (!(await matchesRelease(uri, release))) {
    await remove(uri);
    throw new ApkInstallError('damaged', DAMAGED_MESSAGE);
  }
  return { uri, reused: false };
}

/** A content:// address for the cached APK that Android's installer may read. */
export async function installerUriFor(fileUri: string): Promise<string> {
  return FileSystem.getContentUriAsync(fileUri);
}

/**
 * expo-intent-launcher opens ONE screen at a time: IntentLauncherModule.kt keeps
 * a single pending promise and throws E_ACTIVITY_ALREADY_STARTED for every new
 * start until that screen's result arrives. This flag mirrors it, so the app
 * can tell the person to restart instead of offering a button that would fail.
 */
let activityPending = false;

/** True while a screen opened by onService (installer or settings) has not answered. */
export function isInstallerBusy(): boolean {
  return activityPending;
}

function isAlreadyStarted(failure: unknown): boolean {
  return typeof failure === 'object' && failure !== null
    && (failure as { code?: unknown }).code === 'E_ACTIVITY_ALREADY_STARTED';
}

async function startActivity(action: string, params: IntentLauncher.IntentLauncherParams): Promise<void> {
  if (activityPending) throw new ApkInstallError('busy', INSTALLER_BUSY_MESSAGE);
  activityPending = true;
  try {
    await IntentLauncher.startActivityAsync(action, params);
  } catch (failure) {
    if (isAlreadyStarted(failure)) throw new ApkInstallError('busy', INSTALLER_BUSY_MESSAGE);
    throw failure;
  } finally {
    // Cleared only when Android answers (or refuses), exactly like the module.
    activityPending = false;
  }
}

/**
 * Opens Android's installer for the APK. When the install succeeds Android
 * stops and replaces this app, so the promise usually never resolves. When it
 * resolves, the person came back without the update being installed.
 */
export async function launchApkInstaller(contentUri: string): Promise<void> {
  await startActivity(ACTION_VIEW, {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/** Opens Android's "Install unknown apps" switch for onService. */
export async function openInstallPermissionSettings(): Promise<void> {
  await startActivity(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${ANDROID_PACKAGE}`,
  });
}

/** Removes every downloaded update file (after a successful update). */
export async function clearDownloadedUpdates(): Promise<void> {
  await remove(updatesDirectory());
}

/** Tests only: forget a screen a previous test left open. */
export function __resetApkInstallerForTests(): void {
  activityPending = false;
}
