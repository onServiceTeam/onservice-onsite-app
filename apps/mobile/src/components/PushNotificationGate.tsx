import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { usePushNotifications } from '@/services/push.service';

/**
 * Refresh server-side device ownership at app launch and every account change.
 * The call is idempotent and prevents a locally cached token from suppressing
 * registration for a different account after an expired or replaced session.
 */
export function PushNotificationGate(): null {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id);
  const { registerForPushNotifications } = usePushNotifications();

  useEffect(() => {
    if (isAuthenticated && userId) {
      void registerForPushNotifications();
    }
  }, [isAuthenticated, userId, registerForPushNotifications]);

  return null;
}

export default PushNotificationGate;
