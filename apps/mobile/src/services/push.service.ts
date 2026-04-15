import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import api from './api';
import { storage } from './api';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface PushNotificationsModule {
  setNotificationHandler: (handler: { handleNotification: () => Promise<any> }) => void;
  setNotificationChannelAsync: (id: string, config: any) => Promise<any>;
  AndroidImportance: { MAX: number };
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (config?: { projectId?: string }) => Promise<{ data: string }>;
  addNotificationReceivedListener: (cb: (n: any) => void) => { remove: () => void };
  addNotificationResponseReceivedListener: (cb: (r: any) => void) => { remove: () => void };
}
interface DeviceModule { isDevice: boolean }
interface ConstantsModule { expoConfig?: { extra?: { eas?: { projectId?: string } } } }
/* eslint-enable @typescript-eslint/no-explicit-any */

let Notifications: PushNotificationsModule | null = null;
let Device: DeviceModule | null = null;
let ExpoConstants: ConstantsModule | null = null;

try {
  Notifications = require('expo-notifications') as PushNotificationsModule;
  Device = require('expo-device') as DeviceModule;
  const mod = require('expo-constants') as { default: ConstantsModule };
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
      vibrationPattern: [0, 250, 250, 250],
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

export function usePushNotifications() {
  const router = useRouter();
  const [isRegistered, setIsRegistered] = useState(false);
  const notificationListenerRef = useRef<{ remove: () => void } | null>(null);
  const responseListenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const savedToken = storage.getString('pushToken');
    setIsRegistered(!!savedToken);
  }, []);

  useEffect(() => {
    if (!Notifications) return;

    notificationListenerRef.current = Notifications.addNotificationReceivedListener(() => {
      // Foreground notification — handled by notification handler
    });

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response: { notification: { request: { content: { data: Record<string, unknown> } } } }) => {
        const data = response.notification.request.content.data;
        const bookingId = typeof data?.bookingId === 'string' ? data.bookingId : null;
        if (bookingId) {
          let userRole = 'customer';
          try {
            const userJson = storage.getString('user');
            if (userJson) {
              const user = JSON.parse(userJson) as { role?: string };
              userRole = user.role ?? 'customer';
            }
          } catch { /* use default */ }
          if (userRole === 'provider') {
            router.push(`/provider/job/${bookingId}` as never);
          } else {
            router.push(`/customer/booking/${bookingId}` as never);
          }
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
        storage.set('pushToken', token);
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
