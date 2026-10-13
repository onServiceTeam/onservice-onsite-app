import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import api, { ApiError, storage } from '@/services/api';
import { platformConfig } from '@/config/platform.config';

/**
 * Android APK updates (Ken, 2026-10-11). The installed tester APK asks our
 * server for the newest signed build (GET /api/v1/app-releases/android/latest)
 * and offers it. This is the account-free path agreed in
 * docs/qa/NATIVE-BUILD-REQUIREMENTS.md: check on launch and on return to the
 * app, a manual "Check for updates", Update or Later, no silent installs, no
 * downgrades, and only builds signed with our release certificate.
 *
 * HA-UPD (human audit, 2026-10-13): from build 4 the app downloads the APK
 * itself, checks it, and opens Android's installer (services/apk-installer.ts
 * and hooks/useApkUpdater.ts). The browser download below stays as the
 * fallback. A pending-update record lets the next start tell whether the
 * install really happened.
 */

export const ANDROID_PACKAGE = 'ph.onservice.app';
/** The onService PH release signing certificate (SHA-256). Android itself also
 * refuses to install a build signed with any other key over this app. */
export const RELEASE_CERTIFICATE_SHA256 = '1EAAB76ADB7A3EF1EA7CBD496A6E47D37F3F3058F2FB96B7FC08248F4D7D42D9';
const DOWNLOAD_PATH = /^\/api\/v1\/app-releases\/android\/files\/onService-\d{1,3}\.\d{1,3}\.\d{1,3}-\d{1,9}\.apk$/;
const MD5 = /^[a-f0-9]{32}$/;

export interface AndroidRelease {
  versionCode: number;
  versionName: string;
  minimumVersionCode: number;
  downloadUrl: string;
  size: number;
  notes: string;
  publishedAt: string;
  /** Lower-case hex MD5 of the APK, only when the manifest publishes one. */
  md5?: string;
}

export interface InstalledVersion {
  versionCode: number | null;
  versionName: string | null;
}

/** What this installed app reports about itself (Android versionCode/versionName). */
export function installedVersion(): InstalledVersion {
  const code = Number(Application.nativeBuildVersion);
  return {
    versionCode: Number.isSafeInteger(code) && code > 0 ? code : null,
    versionName: Application.nativeApplicationVersion ?? null,
  };
}

export function isUpdatableApp(): boolean {
  return Platform.OS === 'android' && installedVersion().versionCode !== null;
}

/** The newest published build, or null when none is published. Anything that
 * does not look exactly like one of our releases is rejected. */
export async function fetchAndroidRelease(): Promise<AndroidRelease | null> {
  let body: unknown;
  try {
    body = (await api.get('/api/v1/app-releases/android/latest', { auth: 'anonymous' })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  const d = (body as { data?: Record<string, unknown> } | undefined)?.data;
  const int = (value: unknown): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
  const versionCode = int(d?.versionCode);
  const minimumVersionCode = int(d?.minimumVersionCode);
  const size = int(d?.size);
  if (!d || d.packageName !== ANDROID_PACKAGE || d.channel !== 'tester' || versionCode === null
      || minimumVersionCode === null || minimumVersionCode > versionCode || size === null
      || typeof d.versionName !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(d.versionName)
      || typeof d.downloadPath !== 'string' || !DOWNLOAD_PATH.test(d.downloadPath)
      // The file must be the one this version names (the server enforces the
      // same rule), so the help text can tell people exactly which file to open.
      || !d.downloadPath.endsWith(`/onService-${d.versionName}-${versionCode}.apk`)
      // md5 is optional (older manifests have none); when present it must be exact.
      || (d.md5 !== undefined && (typeof d.md5 !== 'string' || !MD5.test(d.md5)))
      || d.certificateSha256 !== RELEASE_CERTIFICATE_SHA256) {
    throw new Error('The update information from the server was not valid.');
  }
  const downloadUrl = `${platformConfig.apiUrl}${d.downloadPath}`;
  if (!/^https:\/\//.test(downloadUrl)) throw new Error('Updates are only downloaded over HTTPS.');
  return {
    versionCode, versionName: d.versionName, minimumVersionCode, downloadUrl, size,
    notes: typeof d.notes === 'string' ? d.notes.slice(0, 500) : '',
    publishedAt: typeof d.publishedAt === 'string' ? d.publishedAt : '',
    md5: typeof d.md5 === 'string' ? d.md5 : undefined,
  };
}

/** The exact file name of a release, for example onService-1.0.3-4.apk. */
export function releaseFileName(release: Pick<AndroidRelease, 'versionName' | 'versionCode'>): string {
  return `onService-${release.versionName}-${release.versionCode}.apk`;
}

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'available'; release: AndroidRelease; required: boolean };

/** Offer only a strictly newer build; require it when this one is below the minimum. */
export function decideUpdate(installed: InstalledVersion, release: AndroidRelease | null): UpdateDecision {
  if (!release || installed.versionCode === null) return { kind: 'none' };
  if (release.versionCode <= installed.versionCode) return { kind: 'none' };
  return { kind: 'available', release, required: installed.versionCode < release.minimumVersionCode };
}

/** Fallback: hand the download to the browser. The person then opens the file
 * and Android asks them to install it. */
export async function openReleaseDownload(release: AndroidRelease): Promise<void> {
  await Linking.openURL(release.downloadUrl);
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}

/**
 * Pending-update record (HA-UPD). Saved just before Android's installer opens.
 * A successful install replaces and stops this app, so this record is the only
 * way the next start can tell whether the update really landed.
 */
export interface PendingUpdate {
  targetVersionCode: number;
  versionName: string;
  startedAt: number;
}

const PENDING_KEY = 'appUpdate.pending';
/** After this long, an install that has not landed is treated as not finished. */
export const UNFINISHED_AFTER_MS = 2 * 60_000;

export function readPendingUpdate(): PendingUpdate | null {
  try {
    const raw = storage.getString(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingUpdate> | null;
    if (!value || typeof value.targetVersionCode !== 'number' || !Number.isSafeInteger(value.targetVersionCode)
        || value.targetVersionCode < 1 || typeof value.versionName !== 'string'
        || typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt)) return null;
    return { targetVersionCode: value.targetVersionCode, versionName: value.versionName, startedAt: value.startedAt };
  } catch {
    return null;
  }
}

export function savePendingUpdate(pending: PendingUpdate): void {
  try { storage.set(PENDING_KEY, JSON.stringify(pending)); } catch { /* best effort */ }
}

export function clearPendingUpdate(): void {
  try { storage.delete(PENDING_KEY); } catch { /* best effort */ }
}

export type PendingOutcome =
  | { kind: 'none' }
  /** The installed build reached the target: the update landed. */
  | { kind: 'updated'; versionName: string; versionCode: number }
  /** Started less than UNFINISHED_AFTER_MS ago; the installer may still be busy. */
  | { kind: 'waiting'; pending: PendingUpdate }
  /** Started earlier and the installed build is still older: it did not finish. */
  | { kind: 'unfinished'; pending: PendingUpdate };

export function pendingUpdateOutcome(installed: InstalledVersion, now = Date.now()): PendingOutcome {
  const pending = readPendingUpdate();
  if (!pending || installed.versionCode === null) return { kind: 'none' };
  if (installed.versionCode >= pending.targetVersionCode) {
    return { kind: 'updated', versionName: installed.versionName ?? pending.versionName, versionCode: installed.versionCode };
  }
  return now - pending.startedAt >= UNFINISHED_AFTER_MS ? { kind: 'unfinished', pending } : { kind: 'waiting', pending };
}
