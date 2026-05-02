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

function resolveDeepLink(data: NotificationData): string | null {
  const type = typeof data?.type === 'string' ? data.type : '';
  const bookingId = typeof data?.bookingId === 'string' ? data.bookingId : null;
  const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : null;
  const role = getUserRole();
  const isProvider = role === 'provider';

  switch (type) {
    case 'new_message':
      if (conversationId) {
        return isProvider
          ? `/provider/chat/${conversationId}`
          : `/customer/chat/${conversationId}`;
      }
      if (bookingId) {
        return isProvider ? `/provider/job/${bookingId}` : `/customer/booking/${bookingId}`;
      }
      return null;

    case 'new_job_available':
    case 'quote_expired':
      return bookingId ? `/provider/job/${bookingId}` : '/(provider-tabs)/jobs';

    case 'provider_assigned':
    case 'booking_confirmed':
    case 'auto_confirmed':
    case 'customer_cancelled':
    case 'recurring_update':
      return bookingId
        ? (isProvider ? `/provider/job/${bookingId}` : `/customer/booking/${bookingId}`)
        : null;

    case 'provider_en_route':
    case 'provider_arrived':
      return bookingId ? `/customer/booking/tracker?bookingId=${bookingId}` : null;

    case 'job_completed':
      return bookingId ? `/customer/booking/complete?bookingId=${bookingId}` : null;

    case 'payment_released':
      return isProvider ? '/(provider-tabs)/earnings' : '/(tabs)/wallet';

    case 'dispute_update':
      return bookingId
        ? (isProvider ? `/provider/job/${bookingId}` : `/customer/booking/${bookingId}`)
        : null;

    case 'nbi_expiring':
      return '/provider/settings';

    case 'business_update':
      return '/(provider-tabs)/dashboard';

    case 'area_launch':
      return '/(tabs)/home';

    default:
      break;
  }

  if (bookingId) {
    return isProvider ? `/provider/job/${bookingId}` : `/customer/booking/${bookingId}`;
  }

  return null;
}

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
        const route = resolveDeepLink(data);
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
