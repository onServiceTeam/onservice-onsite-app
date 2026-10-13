import type { AndroidRelease } from '@/services/app-update.service';
import { ApkInstallError, UNAVAILABLE_MESSAGE, type PrepareApkOptions, type PreparedApk } from './apk-installer.types';

/**
 * Web build of the APK installer (HA-UPD). The browser app is always the
 * current version and never shows the update screens, so this stub only keeps
 * the same exports. It imports no native module.
 */

export * from './apk-installer.types';

export const APK_MIME_TYPE = 'application/vnd.android.package-archive';

export function updatesDirectory(): string {
  throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
}

export function apkCacheUri(_release: Pick<AndroidRelease, 'versionName' | 'versionCode'>): string {
  throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
}

export async function prepareVerifiedApk(_release: AndroidRelease, _options: PrepareApkOptions): Promise<PreparedApk> {
  throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
}

export async function installerUriFor(_fileUri: string): Promise<string> {
  throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
}

export async function launchApkInstaller(_contentUri: string): Promise<void> {
  throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
}

export async function openInstallPermissionSettings(): Promise<void> {
  throw new ApkInstallError('unavailable', UNAVAILABLE_MESSAGE);
}

export function isInstallerBusy(): boolean {
  return false;
}

export async function clearDownloadedUpdates(): Promise<void> {
  // Nothing is ever downloaded on the web.
}

export function __resetApkInstallerForTests(): void {
  // Nothing to reset on the web.
}
