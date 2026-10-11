import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Linking, Platform } from 'react-native';

// APK updates (Ken, 2026-10-11): the installed Android app learns about newer
// signed builds from our server, offers Update or Later, and never offers a
// downgrade or a build signed with another key. Real service, gate and
// version row; the installed build, the HTTP client and storage are substituted.

const mockInstalled = { versionName: '1.0.1' as string | null, versionCode: '2' as string | null };
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
    storage: { getString: (key: string) => mockStore.get(key), set: (key: string, value: string) => { mockStore.set(key, value); } },
  };
});
jest.mock('@/config/platform.config', () => ({ platformConfig: { apiUrl: 'https://app.onservice.ph' } }));

import { ApiError } from '@/services/api';
import AppUpdateGate from '@/components/AppUpdateGate';
import AppVersionCheck from '@/components/AppVersionCheck';
import { decideUpdate, fetchAndroidRelease, installedVersion } from '@/services/app-update.service';

const PIN = '1EAAB76ADB7A3EF1EA7CBD496A6E47D37F3F3058F2FB96B7FC08248F4D7D42D9';
const release = (over: Record<string, unknown> = {}) => ({ data: { success: true, data: {
  packageName: 'ph.onservice.app', channel: 'tester', versionCode: 3, versionName: '1.0.2', minimumVersionCode: 1,
  downloadPath: '/api/v1/app-releases/android/files/onService-1.0.2-3.apk', sha256: 'a'.repeat(64), size: 61_400_000,
  certificateSha256: PIN, publishedAt: '2026-10-12T03:00:00.000Z', notes: 'Email sign-in.', ...over } } });
const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  Object.assign(mockInstalled, { versionName: '1.0.1', versionCode: '2' });
  (Platform as { OS: string }).OS = 'android';
});
afterAll(() => { (Platform as { OS: string }).OS = originalOS; });

it('APK update - only a strictly newer build is offered, and a build below the minimum must update', () => {
  const r = { versionCode: 3, versionName: '1.0.2', minimumVersionCode: 1, downloadUrl: 'https://x', size: 1, notes: '', publishedAt: '' };
  expect(decideUpdate({ versionCode: 2, versionName: '1.0.1' }, r)).toEqual({ kind: 'available', release: r, required: false });
  expect(decideUpdate({ versionCode: 3, versionName: '1.0.2' }, r)).toEqual({ kind: 'none' });
  expect(decideUpdate({ versionCode: 4, versionName: '1.0.3' }, r)).toEqual({ kind: 'none' });
  expect(decideUpdate({ versionCode: 2, versionName: '1.0.1' }, { ...r, minimumVersionCode: 3 }))
    .toMatchObject({ kind: 'available', required: true });
  expect(decideUpdate({ versionCode: null, versionName: null }, r)).toEqual({ kind: 'none' });
  expect(decideUpdate({ versionCode: 2, versionName: '1.0.1' }, null)).toEqual({ kind: 'none' });
});

it('APK update - the manifest must be ours: package, channel, HTTPS path on our server and our signing key', async () => {
  mockGet.mockResolvedValue(release());
  await expect(fetchAndroidRelease()).resolves.toMatchObject({ versionCode: 3,
    downloadUrl: 'https://app.onservice.ph/api/v1/app-releases/android/files/onService-1.0.2-3.apk' });
  expect(mockGet).toHaveBeenCalledWith('/api/v1/app-releases/android/latest', { auth: 'anonymous' });
  for (const bad of [
    { packageName: 'com.evil.app' }, { channel: 'beta' }, { certificateSha256: 'B'.repeat(64) },
    { downloadPath: 'https://evil.example/onService-1.0.2-3.apk' }, { downloadPath: '/api/v1/app-releases/android/files/../x.apk' },
    { minimumVersionCode: 4 }, { versionCode: 0 }, { versionName: '1.0' },
  ]) {
    mockGet.mockResolvedValueOnce(release(bad));
    await expect(fetchAndroidRelease()).rejects.toThrow();
  }
  mockGet.mockRejectedValueOnce(new ApiError(404, null, 'none'));
  await expect(fetchAndroidRelease()).resolves.toBeNull();
});

it('APK update - on launch a newer build is offered; Update opens the download, Later hides it for a day', async () => {
  mockGet.mockResolvedValue(release());
  const view = render(<AppUpdateGate />);
  expect(await screen.findByText('Update available')).toBeTruthy();
  expect(screen.getByText(/Version 1\.0\.2 of onService PH is ready \(61 MB\)/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(
    'https://app.onservice.ph/api/v1/app-releases/android/files/onService-1.0.2-3.apk'));
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(screen.queryByText('Update available')).toBeNull();
  expect(Number(mockStore.get('appUpdate.snoozedUntil.3'))).toBeGreaterThan(Date.now() + 23 * 3600_000);
  view.unmount();

  // Snoozed: a fresh launch the same day stays quiet.
  render(<AppUpdateGate />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText('Update available')).toBeNull();
});

it('APK update - a build below the server minimum cannot be dismissed', async () => {
  mockGet.mockResolvedValue(release({ minimumVersionCode: 3 }));
  mockStore.set('appUpdate.snoozedUntil.3', String(Date.now() + 3600_000));
  render(<AppUpdateGate />);
  expect(await screen.findByText('Update required')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
});

it('APK update - an up-to-date app, the web app and an offline check show nothing', async () => {
  mockGet.mockResolvedValue(release({ versionCode: 2, versionName: '1.0.1',
    downloadPath: '/api/v1/app-releases/android/files/onService-1.0.1-2.apk' }));
  const current = render(<AppUpdateGate />);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(current.container.textContent).toBe('');
  current.unmount();

  mockGet.mockRejectedValue(new Error('offline'));
  const offline = render(<AppUpdateGate />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(offline.container.textContent).toBe('');
  offline.unmount();

  (Platform as { OS: string }).OS = 'web';
  mockGet.mockClear();
  const web = render(<><AppUpdateGate /><AppVersionCheck /></>);
  expect(web.container.textContent).toBe('');
  expect(mockGet).not.toHaveBeenCalled();
});

it('APK update - Help shows the installed build and a manual check', async () => {
  expect(installedVersion()).toEqual({ versionCode: 2, versionName: '1.0.1' });
  render(<AppVersionCheck />);
  expect(screen.getByText('Installed app: version 1.0.1 (build 2)')).toBeTruthy();

  mockGet.mockResolvedValueOnce(release({ versionCode: 2, versionName: '1.0.1',
    downloadPath: '/api/v1/app-releases/android/files/onService-1.0.1-2.apk' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('You have the latest version.')).toBeTruthy();

  mockGet.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText("Couldn't check for updates. Check your connection and try again.")).toBeTruthy();

  mockGet.mockResolvedValueOnce(release());
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Version 1.0.2 is available.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(1));
});
