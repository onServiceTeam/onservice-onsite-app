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

interface NotificationBehavior {
  shouldShowAlert: boolean;
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
  setNotificationHandler: (handler: { handleNotification: () => Promise<NotificationBehavior> }) => void;
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

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Notifications || !Device || !Device.isDevice) {
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
      }
      return success;
    } catch {
      return false;
    }
  }, []);

  return {
    isRegistered,
    registerForPushNotifications,
  };
}
