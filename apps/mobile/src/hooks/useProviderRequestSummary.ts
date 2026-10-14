/**
 * D38 Milestone 2 (package P5b): the provider's request counts
 * (GET /api/v1/providers/me/job-requests/summary). Drives the Requests tab
 * badge (unseen requests), the dashboard request card, the Requests segment
 * counts and the offline banner on the Requests screen.
 *
 * One copy keeps the count fresh: the provider tab layout (and the old
 * /provider/leads screen, which opens outside the tabs) passes
 * `{ live: true }`. That copy re-reads on every request and quote event from
 * the live connection, and every 2 minutes as a fallback while the app is in
 * the foreground, the same budget as the customer's Bookings badge
 * (useCustomerRequestSummary). Every other screen reads the shared cache
 * only, with no listeners and no timer of its own.
 *
 * Why (P5b review): when every copy listened, one new:job_request caused one
 * summary GET per mounted screen (each invalidation cancelled the read
 * already running and started another). The API allows 100 requests per
 * user per 15 minutes; a busy hour could lock a pro out, Send quote
 * included. Re-reads also join a read already running (cancelRefetch false),
 * so events arriving together cost one GET.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { REALTIME_EVENTS } from '@/config/realtime-events';
import { getProviderRequestSummary, type ProviderRequestSummary } from '@/services/request.service';
import { useSocketEvent } from './useSocketEvent';
import { useAppActive } from './usePollWhileFocused';
import { BADGE_FALLBACK_MS } from './useCustomerRequestSummary';

export const PROVIDER_REQUEST_SUMMARY_KEY = ['provider-request-summary'] as const;

export const EMPTY_PROVIDER_REQUEST_SUMMARY: ProviderRequestSummary = {
  openCount: 0,
  unseenCount: 0,
  quotesWaitingCount: 0,
  isAvailable: true,
};

export interface ProviderRequestSummaryState {
  summary: ProviderRequestSummary;
  /** True once the server has answered at least once. */
  loaded: boolean;
}

export interface ProviderRequestSummaryOptions {
  /**
   * True for the one copy that listens for request and quote events and
   * runs the 2-minute fallback. Leave it off everywhere else.
   */
  live?: boolean;
}

/**
 * Re-read the summary. Joins a read already running instead of cancelling
 * it, so several callers in the same moment cost one GET.
 */
export function refreshProviderRequestSummary(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: PROVIDER_REQUEST_SUMMARY_KEY }, { cancelRefetch: false });
}

export function useProviderRequestSummary(options: ProviderRequestSummaryOptions = {}): ProviderRequestSummaryState {
  const live = options.live === true;
  const queryClient = useQueryClient();
  // The provider tabs are already role-guarded; this only stops a signed-out
  // or non-provider session from asking.
  const isProvider = useAuthStore((s) => s.user?.role === 'provider');
  const active = useAppActive();
  const { data } = useQuery({
    queryKey: PROVIDER_REQUEST_SUMMARY_KEY,
    queryFn: getProviderRequestSummary,
    enabled: isProvider,
    staleTime: 30_000,
    refetchInterval: live && isProvider && active ? BADGE_FALLBACK_MS : false,
  });
  const listen = live && isProvider;
  const refresh = (): void => refreshProviderRequestSummary(queryClient);
  useSocketEvent(listen ? REALTIME_EVENTS.NEW_JOB_REQUEST : null, refresh);
  useSocketEvent(listen ? REALTIME_EVENTS.JOB_REQUEST_CLOSED : null, refresh);
  useSocketEvent(listen ? REALTIME_EVENTS.QUOTE_DECLINED : null, refresh);
  useSocketEvent(listen ? REALTIME_EVENTS.QUOTE_ACCEPTED : null, refresh);
  useSocketEvent(listen ? REALTIME_EVENTS.QUOTE_NOT_SELECTED : null, refresh);
  return { summary: data ?? EMPTY_PROVIDER_REQUEST_SUMMARY, loaded: data !== undefined };
}

export default useProviderRequestSummary;
