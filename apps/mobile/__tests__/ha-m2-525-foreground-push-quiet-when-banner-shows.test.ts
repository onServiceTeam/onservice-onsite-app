// HA-M2-525 (D38 Milestone 2, package P5a review fix): while the app is open
// and the live connection is up, a request, quote or message push does not
// also show the phone's banner or play its sound, because the in-app banner
// (InAppNoticeHost) already shows that notice and vibrates for the "act now"
// types. Before, an open app showed two banners plus a sound and a
// vibration for every new quote. The notice still goes to the phone's
// notification list. With the live connection down, or for any other type,
// the phone's banner shows as before.
const mockState = { connected: true };

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'expo-token' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('../src/services/socket.service', () => ({ isSocketConnected: () => mockState.connected }));
jest.mock('../src/services/secure-storage', () => ({ getStoredUser: jest.fn(() => null) }));
jest.mock('../src/services/secure-storage.service', () => ({ getPublicItem: jest.fn(() => null), setPublicItem: jest.fn() }));

import * as Notifications from 'expo-notifications';
import '../src/services/push.service';

type ForegroundHandler = { handleNotification: (notification?: unknown) => Promise<Record<string, boolean>> };

function arriving(type: string): unknown {
  return { request: { content: { title: 'onService', body: 'Tap to open.', data: { type, bookingId: 'booking-9' } } } };
}

it('HA-M2-525: a quote push in the open, connected app skips the phone banner and sound; otherwise it shows', async () => {
  // The handler push.service registered when it loaded.
  const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0]![0] as unknown as ForegroundHandler;
  expect(handler).toBeTruthy();

  mockState.connected = true;
  expect(await handler.handleNotification(arriving('new_quote'))).toEqual({
    shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true,
  });
  // A type with no in-app banner still shows.
  expect(await handler.handleNotification(arriving('payout'))).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });

  // Live connection down: the in-app banner cannot show, so the phone's does.
  mockState.connected = false;
  expect(await handler.handleNotification(arriving('new_quote'))).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
});
