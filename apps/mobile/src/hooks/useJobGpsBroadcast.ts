/**
 * Phase 14 Dispatch 12 — Pattern P3: GPS lifecycle hook.
 *
 * Starts background-location updates when booking enters
 * provider_en_route + stops when status leaves provider_arrived.
 * Lifecycle scoping addresses Bug 1203 (battery drain) and Bug 941
 * (privacy toggle) by ensuring GPS only runs while the provider is
 * actively traveling to a job AND has location-sharing enabled.
 *
 * The TaskManager.defineTask handler is intentionally registered at
 * import time (not inside the hook) so the OS can deliver background
 * locations even when the app is backgrounded — a hook-scoped definition
 * would not survive the JS bridge being torn down on background.
 *
 * v1.0 limitation: the hook degrades gracefully if expo-location's
 * background permission is denied — it logs and skips broadcasting.
 * No GPS is broadcast without explicit grant.
 */

import { useEffect } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { logger } from '@/lib/logger';

const TASK_NAME = 'provider-gps-broadcast';

// One-time task registration. The handler reads the active job id from
// secureStorage so a fresh JS context (post-background relaunch) still
// knows which booking the GPS update belongs to.
if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      logger.warn('gps_task_error', { message: error.message });
      return;
    }
    try {
      // Defer to runtime imports so the task body works when re-loaded
      // post-background relaunch even if module graphs differ.
      const secureStorage = await import('@/services/secure-storage');
      const apiModule = await import('@/services/api');
      const api = apiModule.default;
      const bookingId = secureStorage.getSecureItem('active-job-id');
      const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
      const last = locations?.[locations.length - 1];
      if (!bookingId || !last) return;
      await api.post(`/api/v1/provider/jobs/${bookingId}/gps-update`, {
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        accuracy: last.coords.accuracy,
        speed: last.coords.speed,
        heading: last.coords.heading,
        timestamp: last.timestamp,
      });
    } catch (err) {
      logger.warn('gps_broadcast_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

const ACTIVE_STATUSES = new Set(['provider_en_route', 'provider_arrived']);

export function useJobGpsBroadcast(
  bookingId: string,
  status: string,
  enabled: boolean,
): void {
  useEffect(() => {
    let alive = true;
    const shouldBroadcast = enabled && ACTIVE_STATUSES.has(status);

    async function start(): Promise<void> {
      try {
        const { status: perm } = await Location.requestBackgroundPermissionsAsync();
        if (perm !== 'granted' || !alive) return;
        const secureStorage = await import('@/services/secure-storage');
        secureStorage.setSecureItem('active-job-id', bookingId);
        await Location.startLocationUpdatesAsync(TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10_000,
          distanceInterval: 50,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'onService — Active job',
            notificationBody: 'Sharing your location with the customer while you travel.',
          },
        });
      } catch (err) {
        logger.warn('gps_start_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    async function stop(): Promise<void> {
      try {
        const isActive = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
        if (isActive) await Location.stopLocationUpdatesAsync(TASK_NAME);
        const secureStorage = await import('@/services/secure-storage');
        secureStorage.removeSecureItem('active-job-id');
      } catch (err) {
        logger.warn('gps_stop_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (shouldBroadcast) void start();
    else void stop();

    return () => {
      alive = false;
      void stop();
    };
  }, [bookingId, status, enabled]);
}

export default useJobGpsBroadcast;
