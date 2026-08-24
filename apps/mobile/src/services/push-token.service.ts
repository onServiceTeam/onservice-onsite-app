import api from './api';
import { getPublicItem, removePublicItem } from './secure-storage.service';

/**
 * Detach this device from the current account before auth is revoked.
 * Local removal is unconditional so a network outage cannot leave the next
 * signed-in account believing the previous account's registration is valid.
 */
export async function unregisterStoredPushToken(): Promise<void> {
  const token = getPublicItem('pushToken');
  if (!token) return;

  try {
    await api.post('/api/v1/notifications/push-token/unregister', { token });
  } catch {
    // Best effort. The next successful registration atomically reassigns the
    // token server-side, so logout must still clear its local ownership marker.
  } finally {
    removePublicItem('pushToken');
  }
}
