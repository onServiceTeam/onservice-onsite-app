/**
 * D38 Milestone 2: the signed-in person's message threads, and the unread
 * total for the Messages tab badge.
 *
 * Both re-read when a message or thread event arrives over the live
 * connection. Otherwise the inbox re-reads every 2 minutes (1 minute while the
 * connection is down) while it is on screen, and the badge every 2 minutes
 * while the app is in the foreground.
 *
 * The API allows 100 requests per user per 15 minutes, so every reason to
 * re-read (a message notice, a thread event, the open chat marking itself
 * read) goes through one shared, coalesced refresh: events that arrive within
 * CHAT_LIST_REFRESH_DELAY_MS of each other cost one inbox read and one badge
 * read, however many screens listen. Before, one incoming message on an open
 * chat cost 9 requests. messages:read is not a reason to re-read: it reaches
 * only an open chat's room, the open chat already counts its own read, and
 * the other person reading changes neither this person's unread count nor
 * their inbox.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getInbox, getUnreadCount, type InboxPage } from '@/services/messaging.service';
import { useAuthStore } from '@/stores/auth.store';
import { REALTIME_EVENTS } from '@/config/realtime-events';
import { useSocketEvent } from './useSocketEvent';
import { useAppActive, usePollWhileFocused } from './usePollWhileFocused';

export const CHAT_INBOX_KEY = ['chat-inbox', 'all'] as const;
export const CHAT_UNREAD_KEY = ['chat-unread'] as const;

/** Re-read reasons that arrive within this window share one inbox and one badge read. */
export const CHAT_LIST_REFRESH_DELAY_MS = 1500;

const INBOX_EVENTS = [
  REALTIME_EVENTS.NOTIFICATION_MESSAGE,
  REALTIME_EVENTS.CONVERSATION_OPENED,
  REALTIME_EVENTS.CONVERSATION_STATE,
] as const;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshClient: QueryClient | null = null;

/**
 * Re-read the inbox and the unread badge once, shortly. Calls while a re-read
 * is already scheduled join it. Only queries on screen actually fetch.
 */
export function requestChatListRefresh(queryClient: QueryClient): void {
  refreshClient = queryClient;
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const client = refreshClient;
    refreshClient = null;
    if (!client) return;
    void client.invalidateQueries({ queryKey: CHAT_INBOX_KEY });
    void client.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
  }, CHAT_LIST_REFRESH_DELAY_MS);
}

function useRefreshOnChatEvents(enabled: boolean): void {
  const queryClient = useQueryClient();
  const refresh = (): void => requestChatListRefresh(queryClient);
  useSocketEvent(enabled ? INBOX_EVENTS[0] : null, refresh);
  useSocketEvent(enabled ? INBOX_EVENTS[1] : null, refresh);
  useSocketEvent(enabled ? INBOX_EVENTS[2] : null, refresh);
}

export function useChatInbox(): {
  data: InboxPage | undefined;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => void;
} {
  const signedIn = useAuthStore((s) => s.isAuthenticated && !!s.user);
  const interval = usePollWhileFocused({ connectedMs: 120_000, disconnectedMs: 60_000, enabled: signedIn });
  const query = useQuery({
    queryKey: CHAT_INBOX_KEY,
    queryFn: () => getInbox({ state: 'all', pageSize: 50 }),
    enabled: signedIn,
    staleTime: 15_000,
    refetchInterval: interval,
  });
  useRefreshOnChatEvents(signedIn);
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: () => { void query.refetch(); },
  };
}

/** Unread messages across every thread (the Messages tab badge). */
export function useChatUnreadCount(): number {
  const signedIn = useAuthStore((s) => s.isAuthenticated && !!s.user);
  const active = useAppActive();
  const { data } = useQuery({
    queryKey: CHAT_UNREAD_KEY,
    queryFn: getUnreadCount,
    enabled: signedIn,
    staleTime: 15_000,
    refetchInterval: signedIn && active ? 120_000 : false,
  });
  useRefreshOnChatEvents(signedIn);
  return typeof data === 'number' && data > 0 ? data : 0;
}
