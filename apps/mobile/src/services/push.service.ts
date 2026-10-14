import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import api from './api';
// Phase K CRIT-K03 fix — read user from canonical secure-storage
// (per-device keychain-backed encryption). Pre-fix this file read
// the legacy unencrypted `storage` MMKV instance which the auth-
// migration emptied long ago, so `getUserRole()` always returned
// 'customer'. Provider deep-links from push notifications routed
// to customer screens. Real-time job notifications opened the
// wrong screen.
import { getStoredUser } from './secure-storage';
// Phase K MED-K12 fix — publicStorage helpers for pushToken
// persistence (token isn't PII; survives auth-migration).
import { getPublicItem, setPublicItem } from './secure-storage.service';
import { resolveNotificationRoute } from '@/utils/notification-navigation';
import { BANNER_NOTICE_TYPES } from '@/utils/in-app-notice-types';
import { isSocketConnected } from './socket.service';
import { addBreadcrumb, captureMessage } from '@sentry/core';

/**
 * D38 Milestone 2: what happened the last time this device tried to register
 * for phone push. Before, every failure was swallowed, so a provider had no
 * way to learn that new requests would only reach them while the app was
 * open (Android push needs a Firebase project, which is not set up yet).
 *
 *   unknown      no attempt yet
 *   registered   the server has this device's push token
 *   denied       the person refused notification permission
 *   unavailable  no push on this device or build (simulator, web, module missing)
 *   error        the push service or the server refused the token
 */
export type PushRegistrationStatus = 'unknown' | 'registered' | 'denied' | 'unavailable' | 'error';

let registrationStatus: PushRegistrationStatus = 'unknown';
let reportedFailure = false;
const registrationListeners = new Set<(status: PushRegistrationStatus) => void>();

export function getPushRegistrationStatus(): PushRegistrationStatus {
  return registrationStatus;
}

export function onPushRegistrationStatus(listener: (status: PushRegistrationStatus) => void): () => void {
  registrationListeners.add(listener);
  return () => { registrationListeners.delete(listener); };
}

function setRegistrationStatus(status: PushRegistrationStatus, reason?: string): void {
  registrationStatus = status;
  if ((status === 'error' || status === 'unavailable') && !reportedFailure) {
    // Once per app run, with no token or account details. A real failure
    // (for example an Android build with no Firebase project) is sent to
    // Sentry as its own event so ops can count the phones that cannot get
    // push; a breadcrumb alone is sent only if some later error is captured.
    // 'unavailable' (simulator, no push module) stays a breadcrumb.
    reportedFailure = true;
    try {
      if (status === 'error') {
        captureMessage('push registration error', { level: 'warning', tags: { area: 'push' }, extra: reason ? { reason } : undefined });
      } else {
        addBreadcrumb({ category: 'push', level: 'warning', message: `push registration ${status}`, data: reason ? { reason } : undefined });
      }
    } catch { /* reporting is best effort */ }
  }
  for (const listener of Array.from(registrationListeners)) {
    try { listener(status); } catch { /* a screen's listener must not break registration */ }
  }
}

interface NotificationBehavior {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}
interface NotificationPayload {
  request: { content: { title?: string; body?: string; data?: Record<string, unknown> } };
}
interface NotificationResponse {
  notification: NotificationPayload;
}
interface PushNotificationsModule {
  setNotificationHandler: (handler: { handleNotification: (notification?: NotificationPayload) => Promise<NotificationBehavior> }) => void;
  setNotificationChannelAsync: (id: string, config: { name: string; importance: number }) => Promise<unknown>;
  AndroidImportance: { MAX: number };
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (config?: { projectId?: string }) => Promise<{ data: string }>;
  addNotificationReceivedListener: (cb: (n: NotificationPayload) => void) => { remove: () => void };
  addNotificationResponseReceivedListener: (cb: (r: NotificationResponse) => void) => { remove: () => void };
}
interface DeviceModule { isDevice: boolean }
interface ConstantsModule { expoConfig?: { extra?: { eas?: { projectId?: string } } } }

let Notifications: PushNotificationsModule | null = null;
let Device: DeviceModule | null = null;
let ExpoConstants: ConstantsModule | null = null;

try {
  /* eslint-disable @typescript-eslint/no-require-imports */
  Notifications = require('expo-notifications') as PushNotificationsModule;
  Device = require('expo-device') as DeviceModule;
  const mod = require('expo-constants') as { default: ConstantsModule };
  /* eslint-enable @typescript-eslint/no-require-imports */
  ExpoConstants = mod.default;
} catch {
  // Packages not installed — push will be unavailable
}

/**
 * How a push that arrives while the app is open is shown. Request, quote and
 * message notices also arrive over the live connection, where
 * InAppNoticeHost shows its own banner (and vibrates for the four "act now"
 * types). While that connection is up, the phone's banner and sound for
 * those types are skipped so a new quote does not show two banners at once;
 * the notice still goes to the notification list. Anything else, or any
 * notice while the live connection is down, shows as before.
 */
export function foregroundNotificationBehavior(data: Record<string, unknown> | null | undefined): NotificationBehavior {
  const type = typeof data?.type === 'string' ? data.type : '';
  const shownInApp = BANNER_NOTICE_TYPES.has(type) && isSocketConnected();
  return {
    shouldShowBanner: !shownInApp,
    shouldShowList: true,
    shouldPlaySound: !shownInApp,
    shouldSetBadge: true,
  };
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification?: NotificationPayload) =>
      foregroundNotificationBehavior(notification?.request?.content?.data),
  });
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Notifications || !Device || !Device.isDevice) {
    setRegistrationStatus('unavailable', 'no push module or not a device');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    setRegistrationStatus('denied');
    return null;
  }

  const projectId = ExpoConstants?.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });

  return tokenData.data;
}

async function registerTokenWithServer(token: string): Promise<boolean> {
  try {
    await api.post('/api/v1/notifications/push-token', {
      token,
      platform: Platform.OS,
    });
    return true;
  } catch {
    return false;
  }
}

function getUserRole(): string {
  try {
    const userJson = getStoredUser();
    if (userJson) {
      const user = JSON.parse(userJson) as { role?: string };
      return user.role ?? 'customer';
    }
  } catch { /* default */ }
  return 'customer';
}

type NotificationData = Record<string, unknown>;

export function usePushNotifications(): { isRegistered: boolean; registerForPushNotifications: () => Promise<boolean> } {
  const router = useRouter();
  const [isRegistered, setIsRegistered] = useState(false);
  const notificationListenerRef = useRef<{ remove: () => void } | null>(null);
  const responseListenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    // Phase K MED-K12 fix — pushToken used to live in the legacy
    // `storage` MMKV which the auth-migration emptied, so
    // isRegistered always started false and the user was prompted
    // for push permission on EVERY app launch. publicStorage (id:
    // 'onservice-public') is unaffected by the migration and is
    // appropriate for the Expo push token (not PII; opaque
    // identifier registered with Expo).
    const savedToken = getPublicItem('pushToken');
    setIsRegistered(!!savedToken);
  }, []);

  useEffect(() => {
    if (!Notifications) return;

    notificationListenerRef.current = Notifications.addNotificationReceivedListener(() => {
      // Foreground notification — handled by notification handler (shows alert)
    });

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData | undefined;
        if (!data) return;
        const role = getUserRole() === 'provider' ? 'provider' : 'customer';
        const type = typeof data.type === 'string' ? data.type : '';
        const route = resolveNotificationRoute(type, data, role);
        if (route) {
          router.push(route as never);
        }
      },
    );

    return () => {
      notificationListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [router]);

  const registerForPushNotifications = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getExpoPushToken();
      if (!token) return false;

      const success = await registerTokenWithServer(token);
      if (success) {
        // MED-K12 — publicStorage survives the auth-migration; legacy
        // `storage` would be emptied at next app launch.
        setPublicItem('pushToken', token);
        setIsRegistered(true);
        setRegistrationStatus('registered');
      } else {
        setRegistrationStatus('error', 'server refused the push token');
      }
      return success;
    } catch (error) {
      // Typically getExpoPushTokenAsync on an Android build with no
      // Firebase project. New requests then reach this phone only while the
      // app is open (live connection and in-app banner).
      setRegistrationStatus('error', error instanceof Error ? error.name : 'unknown');
      return false;
    }
  }, []);

  return {
    isRegistered,
    registerForPushNotifications,
  };
}
