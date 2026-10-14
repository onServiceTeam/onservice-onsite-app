// apps/mobile/src/services/push.service.web.ts
//
// Phase 200 — WEB no-op for push notifications. expo-notifications has no
// browser implementation; the web build doesn't register for push. Mirrors
// the native hook's shape so callers (_layout, provider/settings) compile.
//
// D38 Milestone 2: the registration status always reads 'unavailable' on the
// web, so screens can say that new requests show only while the page is open.

export type PushRegistrationStatus = 'unknown' | 'registered' | 'denied' | 'unavailable' | 'error';

export function getPushRegistrationStatus(): PushRegistrationStatus {
  return 'unavailable';
}

export function onPushRegistrationStatus(_listener: (status: PushRegistrationStatus) => void): () => void {
  return () => undefined;
}

export function usePushNotifications(): {
  isRegistered: boolean;
  registerForPushNotifications: () => Promise<boolean>;
} {
  return {
    isRegistered: false,
    registerForPushNotifications: async () => false,
  };
}
