import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppState, Linking, Platform } from 'react-native';

// HA-UPD (Ken's human audit, 2026-10-13): "1.0.1 is not updating itself to
// 1.0.2 ... keeps saying Update available". The app now downloads the APK
// itself, checks it, opens Android's installer, and tells the truth when the
// install did not happen.
//
// Real gate, version row, shared hook, installer module and update service.
// Substituted: the installed build (expo-application), the HTTP client and
// storage, the phone's file system (an in-memory fake of expo-file-system/
// legacy that behaves like the real one: files, folders, sizes, MD5, free
// space, content:// addresses) and Android's activity launcher.

const mockInstalled = { versionName: '1.0.2' as string | null, versionCode: '3' as string | null };
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() { return mockInstalled.versionName; },
  get nativeBuildVersion() { return mockInstalled.versionCode; },
}));
const mockGet = jest.fn();
const mockStore = new Map<string, string>();
jest.mock('@/services/api', () => {
  class ApiError extends Error {
    status: number; body: unknown;
    constructor(status: number, body: unknown, fallback: string) { super(fallback); this.status = status; this.body = body; }
  }
  return {
    __esModule: true,
    ApiError,
    default: { get: (...args: unknown[]) => mockGet(...args) },
    storage: {
      getString: (key: string) => mockStore.get(key),
      set: (key: string, value: string) => { mockStore.set(key, value); },
      delete: (key: string) => { mockStore.delete(key); },
    },
  };
});
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://app.onservice.ph' } }));

const mockFs = {
  files: new Map<string, { size: number; md5: string }>(),
  dirs: new Set<string>(),
  free: 10_000_000_000,
  /** What the next download writes and how the server answers. */
  next: { size: 70_000_000, md5: '0123456789abcdef0123456789abcdef', status: 200 },
  /** When true, a download stays half-way until finish() or cancel. */
  holdDownloads: false,
  finish: null as null | (() => void),
  /** How many times a running download was cancelled. */
  cancels: 0,
};
jest.mock('expo-file-system/legacy', () => {
  const CACHE = 'file:///data/user/0/ph.onservice.app/cache/';
  return {
    cacheDirectory: CACHE,
    getInfoAsync: jest.fn(async (uri: string, options?: { md5?: boolean }) => {
      if (mockFs.dirs.has(uri)) return { exists: true, isDirectory: true, uri, size: 0, modificationTime: 0 };
      const file = mockFs.files.get(uri);
      if (!file) return { exists: false, isDirectory: false, uri };
      return { exists: true, isDirectory: false, uri, size: file.size, modificationTime: 0,
        ...(options?.md5 ? { md5: file.md5 } : {}) };
    }),
    makeDirectoryAsync: jest.fn(async (uri: string) => { mockFs.dirs.add(uri); }),
    readDirectoryAsync: jest.fn(async (dir: string) => [...mockFs.files.keys()]
      .filter(key => key.startsWith(dir)).map(key => key.slice(dir.length))),
    deleteAsync: jest.fn(async (uri: string) => {
      for (const key of [...mockFs.files.keys()]) if (key === uri || key.startsWith(uri)) mockFs.files.delete(key);
      mockFs.dirs.delete(uri);
    }),
    getFreeDiskStorageAsync: jest.fn(async () => mockFs.free),
    getContentUriAsync: jest.fn(async (uri: string) =>
      uri.replace(CACHE, 'content://ph.onservice.app.FileSystemFileProvider/cached_expo_files/')),
    createDownloadResumable: jest.fn((_url: string, uri: string, _options: unknown,
      onProgress: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void) => {
      let cancelled = false;
      let release: () => void = () => undefined;
      return {
        downloadAsync: async () => {
          const { size, md5, status } = mockFs.next;
          onProgress({ totalBytesWritten: size / 2, totalBytesExpectedToWrite: 70_000_000 });
          mockFs.files.set(uri, { size: size / 2, md5: 'partial' });
          if (mockFs.holdDownloads) {
            await new Promise<void>(resolve => { release = resolve; mockFs.finish = resolve; });
          }
          if (cancelled) return undefined;
          mockFs.files.set(uri, { size, md5 });
          onProgress({ totalBytesWritten: size, totalBytesExpectedToWrite: 70_000_000 });
          return { uri, status, headers: {}, mimeType: 'application/vnd.android.package-archive' };
        },
        cancelAsync: async () => { cancelled = true; mockFs.cancels += 1; release(); },
      };
    }),
  };
});

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import AppUpdateGate from '@/components/AppUpdateGate';
import AppVersionCheck from '@/components/AppVersionCheck';
import { fetchAndroidRelease } from '@/services/app-update.service';
import { __resetApkUpdaterForTests } from '@/hooks/useApkUpdater';

// The jest stand-in copies expo-intent-launcher's native rule: one activity at
// a time, and a second start before the first one's answer is refused.
type LauncherOutcome = () => Promise<{ resultCode: number }>;
const { withSinglePendingActivity, alreadyStartedError } = jest.requireMock('expo-intent-launcher') as {
  withSinglePendingActivity: (outcome: LauncherOutcome) => (...args: unknown[]) => Promise<{ resultCode: number }>;
  alreadyStartedError: () => Error;
};
const neverAnswers: LauncherOutcome = () => new Promise(() => undefined);

const PIN = '1EAAB76ADB7A3EF1EA7CBD496A6E47D37F3F3058F2FB96B7FC08248F4D7D42D9';
const MD5 = '0123456789abcdef0123456789abcdef';
const URL = 'https://app.onservice.ph/api/v1/app-releases/android/files/onService-1.0.3-4.apk';
const UPDATES_DIR = 'file:///data/user/0/ph.onservice.app/cache/updates/';
const APK_URI = `${UPDATES_DIR}onService-1.0.3-4.apk`;
const CONTENT_URI = 'content://ph.onservice.app.FileSystemFileProvider/cached_expo_files/updates/onService-1.0.3-4.apk';
const manifest = (over: Record<string, unknown> = {}) => ({ data: { success: true, data: {
  packageName: 'ph.onservice.app', channel: 'tester', versionCode: 4, versionName: '1.0.3', minimumVersionCode: 1,
  downloadPath: '/api/v1/app-releases/android/files/onService-1.0.3-4.apk', sha256: 'a'.repeat(64), size: 70_000_000,
  certificateSha256: PIN, publishedAt: '2026-10-14T03:00:00.000Z', notes: 'In-app updates.', ...over } } });

const mockStart = jest.mocked(IntentLauncher.startActivityAsync);
const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.free = 10_000_000_000;
  mockFs.next = { size: 70_000_000, md5: MD5, status: 200 };
  mockFs.holdDownloads = false;
  mockFs.finish = null;
  mockFs.cancels = 0;
  Object.assign(mockInstalled, { versionName: '1.0.2', versionCode: '3' });
  (Platform as { OS: string }).OS = 'android';
  // The update run lives outside any one screen, so each test starts clean.
  __resetApkUpdaterForTests();
  // By default the person comes back from Android's screen without installing.
  mockStart.mockReset().mockImplementation(withSinglePendingActivity(async () => ({ resultCode: 0 })));
  mockGet.mockResolvedValue(manifest());
});
afterEach(() => { jest.useRealTimers(); });
afterAll(() => { (Platform as { OS: string }).OS = originalOS; });

async function openOffer(): Promise<void> {
  render(<AppUpdateGate />);
  expect(await screen.findByText('Update available')).toBeTruthy();
}

/** The person comes back to onService and Android's installer never answers. */
function returnToAppWithoutAnswer(): void {
  jest.useFakeTimers();
  const listeners = jest.mocked(AppState.addEventListener).mock.calls.map(call => call[1] as (state: string) => void);
  act(() => { listeners.forEach(listener => listener('active')); });
  act(() => { jest.advanceTimersByTime(3000); });
  jest.useRealTimers();
}

const INSTALLER_FAILED = "We couldn't open Android's installer. Tap Try again, or download the update in your browser instead.";
const VIEW_INTENT = ['android.intent.action.VIEW', {
  data: 'content://ph.onservice.app.FileSystemFileProvider/cached_expo_files/updates/onService-1.0.3-4.apk',
  type: 'application/vnd.android.package-archive', flags: 1,
}] as const;

it("HA-UPD-1: tapping Update downloads into the versioned cache path and opens Android's installer with the content URI and APK type", async () => {
  mockGet.mockResolvedValue(manifest({ md5: MD5 }));
  mockFs.holdDownloads = true;
  let pendingWhenInstallerOpened: string | undefined;
  // A real install stops and replaces the app, so this promise never settles.
  mockStart.mockImplementation(withSinglePendingActivity(() => {
    pendingWhenInstallerOpened = mockStore.get('appUpdate.pending');
    return new Promise(() => undefined);
  }));
  await openOffer();

  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('Downloading update')).toBeTruthy();
  expect(await screen.findByText('Version 1.0.3: 50%')).toBeTruthy();
  expect(screen.getByText('35 MB of 70 MB')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(screen.queryByText('Update available')).toBeNull();
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(URL, APK_URI, {}, expect.any(Function));

  await act(async () => { mockFs.finish?.(); });
  expect(await screen.findByText('Opening the installer')).toBeTruthy();
  expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(APK_URI, { md5: true });
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart).toHaveBeenCalledWith('android.intent.action.VIEW', {
    data: CONTENT_URI, type: 'application/vnd.android.package-archive', flags: 1,
  });
  // The record that lets the next start check the result was saved first.
  expect(JSON.parse(pendingWhenInstallerOpened ?? 'null')).toMatchObject({ targetVersionCode: 4, versionName: '1.0.3' });
  expect(screen.queryByText('Update available')).toBeNull();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it('HA-UPD-2: a download whose size does not match is deleted, shows the damaged-download message and never opens the installer', async () => {
  mockFs.next = { size: 69_999_999, md5: MD5, status: 200 };
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  expect(await screen.findByText('The download was damaged. Please try again.')).toBeTruthy();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APK_URI, { idempotent: true });
  expect(mockFs.files.has(APK_URI)).toBe(false);
  expect(mockStart).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

it('HA-UPD-3: when the installer closes and the installed build is unchanged, the "did not finish" state offers Try again, Allow installs and the browser', async () => {
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  expect(await screen.findByText('The update did not finish')).toBeTruthy();
  expect(screen.getByText('This phone is still on version 1.0.2. Android did not install version 1.0.3.')).toBeTruthy();
  expect(screen.getByText(/Android needs your permission to install updates from onService/)).toBeTruthy();
  expect(screen.getByText(/Play Protect or your phone's security scan may ask you to confirm/)).toBeTruthy();
  expect(screen.getByText(/not have enough free storage/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Allow installs' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download in browser instead' })).toBeTruthy();
  expect(screen.getByText(/delete any older onService APK files from your Downloads folder\. Then open the file named onService-1\.0\.3-4\.apk/)).toBeTruthy();
  expect(screen.queryByText('Update available')).toBeNull();
});

it('HA-UPD-4: Try again reuses the verified file already in the cache and does not download it again', async () => {
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('The update did not finish')).toBeTruthy();
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  expect(mockStart).toHaveBeenLastCalledWith('android.intent.action.VIEW', {
    data: CONTENT_URI, type: 'application/vnd.android.package-archive', flags: 1,
  });
  expect(await screen.findByText('The update did not finish')).toBeTruthy();
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(1);
  expect(mockFs.files.get(APK_URI)).toEqual({ size: 70_000_000, md5: MD5 });
});

it('HA-UPD-5: an app start after the install landed says "Updated to version X" once and clears the record and the cached APK', async () => {
  Object.assign(mockInstalled, { versionName: '1.0.3', versionCode: '4' });
  mockStore.set('appUpdate.pending', JSON.stringify({ targetVersionCode: 4, versionName: '1.0.3', startedAt: Date.now() - 60_000 }));
  mockFs.dirs.add(UPDATES_DIR);
  mockFs.files.set(APK_URI, { size: 70_000_000, md5: MD5 });

  const first = render(<AppUpdateGate />);
  expect(await screen.findByText('Updated to version 1.0.3')).toBeTruthy();
  expect(mockStore.has('appUpdate.pending')).toBe(false);
  await waitFor(() => expect(mockFs.files.size).toBe(0));
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(UPDATES_DIR, { idempotent: true });
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(screen.queryByText('Updated to version 1.0.3')).toBeNull();
  first.unmount();

  render(<AppUpdateGate />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Updated to version 1.0.3')).toBeNull();
});

it('HA-UPD-6: not enough free space stops the download before it starts, with a clear message', async () => {
  mockFs.free = 100_000_000;
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  expect(await screen.findByText(
    'Not enough free space. This update needs about 175 MB free and your phone has 100 MB. Free up some space, then try again.',
  )).toBeTruthy();
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
});

it('HA-UPD-7: the web build never renders the update gate or the version row, even with an install record present', async () => {
  (Platform as { OS: string }).OS = 'web';
  mockStore.set('appUpdate.pending', JSON.stringify({ targetVersionCode: 4, versionName: '1.0.3', startedAt: 0 }));
  const view = render(<><AppUpdateGate /><AppVersionCheck /></>);
  await act(async () => { await Promise.resolve(); });

  expect(view.container.textContent).toBe('');
  expect(mockGet).not.toHaveBeenCalled();
  expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
});

it('HA-UPD-7b: the web installer module loads without any native module and refuses to install', async () => {
  let web: typeof import('@/services/apk-installer.web') | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-intent-launcher', () => { throw new Error('native intent module loaded on the web'); });
    jest.doMock('expo-file-system/legacy', () => { throw new Error('native file system loaded on the web'); });
    web = jest.requireActual('@/services/apk-installer.web');
  });
  expect(web).toBeDefined();
  await expect(web!.launchApkInstaller('content://x')).rejects.toMatchObject({ code: 'unavailable' });
  await expect(web!.prepareVerifiedApk({ versionCode: 4, versionName: '1.0.3', minimumVersionCode: 1, downloadUrl: URL,
    size: 70_000_000, notes: '', publishedAt: '' }, { control: web!.createDownloadControl() }))
    .rejects.toMatchObject({ code: 'unavailable' });
});

it('HA-UPD-8: Allow installs opens Android\'s "Install unknown apps" switch for onService', async () => {
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('The update did not finish')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Allow installs' }));
  await waitFor(() => expect(mockStart).toHaveBeenLastCalledWith(
    'android.settings.MANAGE_UNKNOWN_APP_SOURCES', { data: 'package:ph.onservice.app' }));
});

it('HA-UPD-9: Download in browser instead opens the old browser link and names the exact file to open', async () => {
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('The update did not finish')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Download in browser instead' }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(URL));
  expect(await screen.findByText(
    'The download opened in your browser. When it finishes, open onService-1.0.3-4.apk and tap Install.',
  )).toBeTruthy();
});

it('HA-UPD-10: a download whose MD5 does not match the manifest is deleted and never opened', async () => {
  mockGet.mockResolvedValue(manifest({ md5: MD5 }));
  mockFs.next = { size: 70_000_000, md5: 'ffffffffffffffffffffffffffffffff', status: 200 };
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  expect(await screen.findByText('The download was damaged. Please try again.')).toBeTruthy();
  expect(mockFs.files.has(APK_URI)).toBe(false);
  expect(mockStart).not.toHaveBeenCalled();
});

it('HA-UPD-11: Cancel stops the download, removes the partial file and returns to the offer', async () => {
  mockFs.holdDownloads = true;
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('Version 1.0.3: 50%')).toBeTruthy();
  expect(mockFs.files.get(APK_URI)).toEqual({ size: 35_000_000, md5: 'partial' });

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByText('Update available')).toBeTruthy();
  expect(mockFs.files.has(APK_URI)).toBe(false);
  expect(mockStart).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
});

it('HA-UPD-12: an install started over 2 minutes ago that never landed makes the next offer say it did not finish, with the same help', async () => {
  mockStore.set('appUpdate.pending', JSON.stringify({ targetVersionCode: 4, versionName: '1.0.3', startedAt: Date.now() - 3 * 60_000 }));
  await openOffer();

  expect(screen.getByText('Your last update did not finish.')).toBeTruthy();
  expect(screen.getByText(/Android needs your permission to install updates from onService/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Allow installs' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download in browser instead' })).toBeTruthy();
  // The record stays until the update really lands.
  expect(mockStore.has('appUpdate.pending')).toBe(true);
});

it('HA-UPD-13: on Help, Download update shows a message when Android\'s installer cannot open, instead of failing silently', async () => {
  // For example ActivityNotFoundException: nothing on the phone can open the APK.
  mockStart.mockRejectedValue(new Error('No Activity found to handle Intent'));
  render(<AppVersionCheck />);
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Version 1.0.3 is available.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
  expect(await screen.findByText(INSTALLER_FAILED)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download in browser instead' })).toBeTruthy();
  // The installer never opened, so no install is recorded as pending.
  expect(mockStore.has('appUpdate.pending')).toBe(false);
});

it('HA-UPD-14: the manifest md5 is read when present, absent when not published, and rejected when malformed', async () => {
  mockGet.mockResolvedValueOnce(manifest({ md5: MD5 }));
  await expect(fetchAndroidRelease()).resolves.toMatchObject({ versionCode: 4, md5: MD5 });
  mockGet.mockResolvedValueOnce(manifest());
  await expect(fetchAndroidRelease()).resolves.toMatchObject({ versionCode: 4, md5: undefined });
  for (const md5 of ['ABCDEF0123456789ABCDEF0123456789', 'abc', 42, null]) {
    mockGet.mockResolvedValueOnce(manifest({ md5 }));
    await expect(fetchAndroidRelease()).rejects.toThrow('The update information from the server was not valid.');
  }
});

it('HA-UPD-15: back in the app with no answer from the installer, the screen asks for a restart and offers only the browser, never a button Android would refuse', async () => {
  mockStart.mockImplementation(withSinglePendingActivity(neverAnswers));
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('Opening the installer')).toBeTruthy();
  await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));

  returnToAppWithoutAnswer();
  expect(await screen.findByText('Close and reopen onService')).toBeTruthy();
  expect(screen.getByText(/Close onService completely \(swipe it away from your recent apps\), open it again/)).toBeTruthy();
  expect(screen.queryByText('Opening the installer')).toBeNull();
  expect(screen.getByRole('button', { name: 'Download in browser instead' })).toBeTruthy();
  expect(screen.getByText(/Then open the file named onService-1\.0\.3-4\.apk/)).toBeTruthy();
  // expo-intent-launcher still holds the first installer, so these would fail.
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Allow installs' })).toBeNull();
  // The attempt stays recorded so the next start can tell whether it landed.
  expect(JSON.parse(mockStore.get('appUpdate.pending') ?? 'null')).toMatchObject({ targetVersionCode: 4 });
});

it('HA-UPD-16: a required update in the "did not finish" state still cannot be dismissed', async () => {
  mockGet.mockResolvedValue(manifest({ minimumVersionCode: 4 }));
  render(<AppUpdateGate />);
  expect(await screen.findByText('Update required')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  expect(await screen.findByText('The update did not finish')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
});

it('HA-UPD-17: when the late installer answer arrives after the restart message, the screen moves to "did not finish" and Try again opens the installer again', async () => {
  let answer: (value: { resultCode: number }) => void = () => undefined;
  let firstCall = true;
  mockStart.mockImplementation(withSinglePendingActivity(() => {
    if (!firstCall) return Promise.resolve({ resultCode: 0 });
    firstCall = false;
    return new Promise(resolve => { answer = resolve; });
  }));
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('Opening the installer')).toBeTruthy();
  await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  returnToAppWithoutAnswer();
  expect(await screen.findByText('Close and reopen onService')).toBeTruthy();

  await act(async () => { answer({ resultCode: 0 }); });
  expect(await screen.findByText('The update did not finish')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  expect(mockStart).toHaveBeenLastCalledWith(...VIEW_INTENT);
  expect(await screen.findByText('The update did not finish')).toBeTruthy();
  expect(screen.queryByText(INSTALLER_FAILED)).toBeNull();
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(1);
});

it('HA-UPD-18: if Android says another installer screen is still open, the app asks for a restart and keeps the pending-update record', async () => {
  mockStart.mockRejectedValueOnce(alreadyStartedError());
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  expect(await screen.findByText('Close and reopen onService')).toBeTruthy();
  expect(screen.queryByText(INSTALLER_FAILED)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(JSON.parse(mockStore.get('appUpdate.pending') ?? 'null')).toMatchObject({ targetVersionCode: 4, versionName: '1.0.3' });
});

it('HA-UPD-19: leaving Help while the update downloads does not stop it; coming back shows its progress and it still opens the installer', async () => {
  mockFs.holdDownloads = true;
  mockStart.mockImplementation(withSinglePendingActivity(neverAnswers));
  const help = render(<AppVersionCheck />);
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Version 1.0.3 is available.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
  expect(await screen.findByText('Downloading update: 50% (35 MB of 70 MB)')).toBeTruthy();

  help.unmount();
  await act(async () => { await Promise.resolve(); });
  expect(mockFs.cancels).toBe(0);
  expect(mockFs.files.get(APK_URI)).toEqual({ size: 35_000_000, md5: 'partial' });

  render(<AppVersionCheck />);
  expect(screen.getByText('Downloading update: 50% (35 MB of 70 MB)')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();
  await act(async () => { mockFs.finish?.(); });
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith(...VIEW_INTENT));
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(1);
});

// jsdom does no layout, so these two check the structure that keeps the long
// pop-up usable on a small phone: a height limit on the card, the text in a
// scroll area, and the buttons in a footer outside it that never scrolls away.
function expectScrollableCardWithFixedFooter(scrolledText: RegExp[], footerButtons: string[]): void {
  expect(screen.getByTestId('app-update-card').style.maxHeight).toBe('90%');
  const scroll = screen.getByTestId('app-update-scroll');
  const footer = screen.getByTestId('app-update-actions');
  expect(scroll.tagName.toLowerCase()).toBe('rn-scroll-view');
  expect(scroll.contains(footer)).toBe(false);
  for (const text of scrolledText) expect(within(scroll).getByText(text)).toBeTruthy();
  for (const name of footerButtons) {
    expect(within(footer).getByRole('button', { name })).toBeTruthy();
    expect(within(scroll).queryByRole('button', { name })).toBeNull();
  }
}

it('HA-UPD-20: the "did not finish" pop-up scrolls its text inside a height limit and keeps Try again, Allow installs, the browser and Later in a fixed footer', async () => {
  await openOffer();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(await screen.findByText('The update did not finish')).toBeTruthy();

  expectScrollableCardWithFixedFooter(
    [/^The update did not finish$/, /Android needs your permission/, /not have enough free storage/,
      /Then open the file named onService-1\.0\.3-4\.apk/],
    ['Try again', 'Allow installs', 'Download in browser instead', 'Later'],
  );
});

it('HA-UPD-21: the "Your last update did not finish." offer with long release notes also scrolls, and its buttons stay reachable', async () => {
  const notes = 'Fixes and improvements. '.repeat(21).slice(0, 500);
  mockGet.mockResolvedValue(manifest({ notes }));
  mockStore.set('appUpdate.pending', JSON.stringify({ targetVersionCode: 4, versionName: '1.0.3', startedAt: Date.now() - 3 * 60_000 }));
  await openOffer();
  expect(screen.getByText('Your last update did not finish.')).toBeTruthy();

  expectScrollableCardWithFixedFooter(
    [/^Update available$/, /^Fixes and improvements\./, /^Your last update did not finish\.$/, /Android needs your permission/,
      /Then open the file named onService-1\.0\.3-4\.apk/],
    ['Try again', 'Allow installs', 'Download in browser instead', 'Later'],
  );
});
