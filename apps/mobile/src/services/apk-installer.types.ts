/**
 * Shared shapes for the in-app APK installer (HA-UPD). The Android code lives
 * in apk-installer.ts and the web build gets apk-installer.web.ts, which never
 * imports a native module. Both export exactly this surface.
 */

export type ApkInstallErrorCode =
  /** Not enough free storage to download and install. */
  | 'space'
  /** The downloaded file did not match the published size or fingerprint. */
  | 'damaged'
  /** The download stopped (connection, server answer). */
  | 'network'
  /** The person cancelled the download. */
  | 'cancelled'
  /** This build cannot install APKs (web, or no cache folder). */
  | 'unavailable'
  /**
   * Android has not answered the last screen onService opened (installer or
   * settings). expo-intent-launcher keeps one screen at a time and refuses to
   * open another until that answer arrives, which may need an app restart.
   */
  | 'busy';

export class ApkInstallError extends Error {
  readonly code: ApkInstallErrorCode;

  constructor(code: ApkInstallErrorCode, message: string) {
    super(message);
    this.name = 'ApkInstallError';
    this.code = code;
  }
}

export interface ApkDownloadProgress {
  /** Bytes saved so far. */
  received: number;
  /** Bytes expected in total. */
  total: number;
}

/** Lets the screen cancel a download that is running. */
export interface ApkDownloadControl {
  readonly cancelled: boolean;
  cancel(): Promise<void>;
  /** Used by the installer to hand over the running task. */
  attach(task: { cancelAsync(): Promise<void> } | null): void;
}

export interface PrepareApkOptions {
  control: ApkDownloadControl;
  onProgress?: (progress: ApkDownloadProgress) => void;
  /** Called when the file is being checked (size and fingerprint). */
  onVerifying?: () => void;
}

export interface PreparedApk {
  /** file:// address of the verified APK in the app's cache folder. */
  uri: string;
  /** True when an already verified file from an earlier attempt was reused. */
  reused: boolean;
}

/** About 2.5 times the APK: the download itself plus room for Android to install it. */
export const FREE_SPACE_FACTOR = 2.5;

export const DAMAGED_MESSAGE = 'The download was damaged. Please try again.';
export const NETWORK_MESSAGE = 'The download stopped before it finished. Check your connection and try again.';
export const UNAVAILABLE_MESSAGE = 'Updates can only be installed from the onService Android app.';
export const INSTALLER_BUSY_MESSAGE = "Android's installer from the last try has not answered yet.";

export function createDownloadControl(): ApkDownloadControl {
  let cancelled = false;
  let task: { cancelAsync(): Promise<void> } | null = null;
  return {
    get cancelled() { return cancelled; },
    async cancel() {
      cancelled = true;
      const running = task;
      task = null;
      if (running) {
        try { await running.cancelAsync(); } catch { /* already finished */ }
      }
    },
    attach(next) { task = next; },
  };
}
