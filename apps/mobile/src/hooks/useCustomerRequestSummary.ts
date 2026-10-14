/**
 * D38 Milestone 2: how many of the customer's requests have a quote waiting
 * for their decision (GET /api/v1/bookings/requests/summary). Drives the
 * Bookings tab badge.
 *
 * Re-read on new quotes and request changes from the live connection, and
 * every 2 minutes as a fallback, only while the app is in the foreground. The
 * fallback stays at 2 minutes even while the connection is down: with an open
 * chat polling every 20 s, faster badges would crowd the API's limit of 100
 * requests per user per 15 minutes.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { REALTIME_EVENTS } from '@/config/realtime-events';
import { useSocketEvent } from './useSocketEvent';
import { useAppActive } from './usePollWhileFocused';

export const CUSTOMER_REQUEST_SUMMARY_KEY = ['customer-request-summary'] as const;
/** Tab badges re-read at most this often without an event. */
export const BADGE_FALLBACK_MS = 120_000;

export interface CustomerRequestSummary {
  awaitingDecisionCount: number;
}

export async function fetchCustomerRequestSummary(): Promise<CustomerRequestSummary> {
  const res = await api.get<{ success: boolean; data?: { awaitingDecisionCount?: unknown } }>(
    '/api/v1/bookings/requests/summary',
  );
  const count = res.data?.data?.awaitingDecisionCount;
  return { awaitingDecisionCount: typeof count === 'number' && count > 0 ? Math.floor(count) : 0 };
}

export function useCustomerRequestSummary(): CustomerRequestSummary {
  const queryClient = useQueryClient();
  const isCustomer = useAuthStore((s) => s.isAuthenticated && s.user?.role === 'customer');
  const active = useAppActive();
  const { data } = useQuery({
    queryKey: CUSTOMER_REQUEST_SUMMARY_KEY,
    queryFn: fetchCustomerRequestSummary,
    enabled: isCustomer,
    staleTime: 30_000,
    refetchInterval: isCustomer && active ? BADGE_FALLBACK_MS : false,
  });
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: CUSTOMER_REQUEST_SUMMARY_KEY });
  };
  useSocketEvent(isCustomer ? REALTIME_EVENTS.QUOTE_RECEIVED : null, refresh);
  useSocketEvent(isCustomer ? REALTIME_EVENTS.REQUEST_UPDATED : null, refresh);
  return data ?? { awaitingDecisionCount: 0 };
}

export default useCustomerRequestSummary;
