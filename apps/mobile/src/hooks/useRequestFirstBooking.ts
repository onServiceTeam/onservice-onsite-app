/**
 * D38 (Ken, 2026-10-13): every service starts with "describe your job" instead
 * of a set price, because two jobs under the same service rarely cost the same.
 *
 * The switch is the admin setting `request_first_booking`, delivered in the
 * public /api/v1/config bundle as `requestFirstBooking`. It defaults to ON:
 * while the config is loading, offline, or from an older server that does not
 * send the field, the customer still gets the request-first flow. Turning the
 * setting off in admin restores the old fixed-price catalog flow, which stays
 * in the code.
 */

import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { ClientConfig } from '@/hooks/useFeatureFlags';

interface ClientConfigEnvelope {
  success: boolean;
  data: ClientConfig & { requestFirstBooking?: unknown };
}

/** True unless the server explicitly sends `requestFirstBooking: false`. */
export function resolveRequestFirstBooking(config: { requestFirstBooking?: unknown } | undefined): boolean {
  return config?.requestFirstBooking !== false;
}

export function useRequestFirstBooking(): boolean {
  const { data } = useQuery<ClientConfig & { requestFirstBooking?: unknown }>({
    // Same cache entry as useFeatureFlags, so one request serves both.
    queryKey: ['client-config'],
    queryFn: async () => {
      const res = await api.get<ClientConfigEnvelope>('/api/v1/config');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
  return resolveRequestFirstBooking(data);
}

export default useRequestFirstBooking;
