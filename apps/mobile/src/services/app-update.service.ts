import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import api, { ApiError } from '@/services/api';
import { platformConfig } from '@/config/platform.config';

/**
 * Android APK updates (Ken, 2026-10-11). The installed tester APK asks our
 * server for the newest signed build (GET /api/v1/app-releases/android/latest)
 * and offers it; the person downloads it in the browser and Android installs it
 * over the old one, keeping their data. This is the account-free path agreed in
 * docs/qa/NATIVE-BUILD-REQUIREMENTS.md: check on launch and on return to the
 * app, a manual "Check for updates", Update or Later, no silent installs, no
 * downgrades, and only builds signed with our release certificate.
 */

export const ANDROID_PACKAGE = 'ph.onservice.app';
/** The onService PH release signing certificate (SHA-256). Android itself also
 * refuses to install a build signed with any other key over this app. */
export const RELEASE_CERTIFICATE_SHA256 = '1EAAB76ADB7A3EF1EA7CBD496A6E47D37F3F3058F2FB96B7FC08248F4D7D42D9';
const DOWNLOAD_PATH = /^\/api\/v1\/app-releases\/android\/files\/onService-\d{1,3}\.\d{1,3}\.\d{1,3}-\d{1,9}\.apk$/;

export interface AndroidRelease {
  versionCode: number;
  versionName: string;
  minimumVersionCode: number;
  downloadUrl: string;
  size: number;
  notes: string;
  publishedAt: string;
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
      || d.certificateSha256 !== RELEASE_CERTIFICATE_SHA256) {
    throw new Error('The update information from the server was not valid.');
  }
  const downloadUrl = `${platformConfig.apiUrl}${d.downloadPath}`;
  if (!/^https:\/\//.test(downloadUrl)) throw new Error('Updates are only downloaded over HTTPS.');
  return {
    versionCode, versionName: d.versionName, minimumVersionCode, downloadUrl, size,
    notes: typeof d.notes === 'string' ? d.notes.slice(0, 500) : '',
    publishedAt: typeof d.publishedAt === 'string' ? d.publishedAt : '',
  };
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

/** Hand the download to the browser; Android then asks the person to install it. */
export async function openReleaseDownload(release: AndroidRelease): Promise<void> {
  await Linking.openURL(release.downloadUrl);
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}
