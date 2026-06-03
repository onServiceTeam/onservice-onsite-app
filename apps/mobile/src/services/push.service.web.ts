// apps/mobile/src/services/push.service.web.ts
//
// Phase 200 — WEB no-op for push notifications. expo-notifications has no
// browser implementation; the web build doesn't register for push. Mirrors
// the native hook's shape so callers (_layout, provider/settings) compile.

export function usePushNotifications(): {
  isRegistered: boolean;
  registerForPushNotifications: () => Promise<boolean>;
} {
  return {
    isRegistered: false,
    registerForPushNotifications: async () => false,
  };
}
