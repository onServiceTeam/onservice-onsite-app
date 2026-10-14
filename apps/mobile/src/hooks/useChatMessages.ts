/**
 * D38 Milestone 2: the messages of one chat thread, always oldest to newest.
 *
 * - The first page is the newest 30 messages (cursor paging,
 *   GET /conversations/:id/messages?limit=30).
 * - loadEarlier() asks for the page before the oldest message on screen
 *   (`before`), so long threads open fast and older messages still load.
 * - New messages from the live connection, sends and polls are merged by id
 *   and sorted by time, so the list never shows a message twice or out of
 *   order. (Before, the screens reversed an already-ascending page, which
 *   put the newest message at the top and a live message at the bottom.)
 * - While the screen is on screen and the app is in the foreground it asks
 *   for anything newer (`after`) every 20 s while the live connection is down
 *   and every 60 s while it is up, and once each time the connection comes
 *   back.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMessagesPage, type Message, type MessagesPage } from '@/services/messaging.service';
import { onSocketStatus } from '@/services/socket.service';
import { usePollWhileFocused } from './usePollWhileFocused';

export const CHAT_PAGE_SIZE = 30;
export const CHAT_POLL_DISCONNECTED_MS = 20_000;
export const CHAT_POLL_CONNECTED_MS = 60_000;

function timeOf(message: Message): number {
  const value = Date.parse(message.createdAt);
  return Number.isFinite(value) ? value : 0;
}

/** Oldest first; same time breaks on id, like the server's (created_at, id) keyset. */
export function sortMessages(messages: Message[]): Message[] {
  return messages.slice().sort((a, b) => {
    const diff = timeOf(a) - timeOf(b);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface ChatMessagesState {
  messages: Message[];
  isLoading: boolean;
  isError: boolean;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  earlierError: boolean;
  /** The thread state reported with the last page, when the server sent one. */
  pageConversation: MessagesPage['conversation'];
  loadEarlier: () => Promise<void>;
  /** Merge messages that arrived another way (live event, own send). */
  addMessages: (messages: Message[]) => void;
  /** Mark the viewer's own messages read (read receipt from the other side). */
  markOwnRead: (viewerId: string) => void;
  /** Ask the server for anything newer than the newest message on screen. */
  pollNewer: () => Promise<void>;
  retry: () => void;
}

export function useChatMessages(conversationId: string | null | undefined): ChatMessagesState {
  const [byId, setById] = useState<Map<string, Message>>(() => new Map());
  const [hasEarlier, setHasEarlier] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState(false);
  const [pageConversation, setPageConversation] = useState<MessagesPage['conversation']>(null);
  const pollingRef = useRef(false);

  // A different thread starts empty.
  useEffect(() => {
    setById(new Map());
    setHasEarlier(false);
    setNextBefore(null);
    setEarlierError(false);
    setPageConversation(null);
  }, [conversationId]);

  const firstPage = useQuery({
    queryKey: ['chat-messages', conversationId],
    queryFn: () => getMessagesPage(conversationId as string, { limit: CHAT_PAGE_SIZE }),
    enabled: !!conversationId,
    staleTime: 10_000,
    gcTime: 0,
  });

  const refetchFirstRef = useRef(firstPage.refetch);
  refetchFirstRef.current = firstPage.refetch;

  const addMessages = useCallback((incoming: Message[]): void => {
    const valid = incoming.filter((m) => m && typeof m.id === 'string' && (!conversationId || m.conversationId === conversationId));
    if (valid.length === 0) return;
    setById((previous) => {
      const next = new Map(previous);
      for (const message of valid) next.set(message.id, { ...previous.get(message.id), ...message });
      return next;
    });
  }, [conversationId]);

  useEffect(() => {
    const page = firstPage.data;
    if (!page) return;
    addMessages(page.messages);
    setHasEarlier((previous) => previous || page.hasMore);
    setNextBefore((previous) => previous ?? page.nextBefore ?? page.messages[0]?.id ?? null);
    if (page.conversation) setPageConversation(page.conversation);
  }, [firstPage.data, addMessages]);

  const messages = useMemo(() => sortMessages(Array.from(byId.values())), [byId]);
  const newestRef = useRef<Message | null>(null);
  newestRef.current = messages.length > 0 ? messages[messages.length - 1]! : null;
  const oldestRef = useRef<Message | null>(null);
  oldestRef.current = messages[0] ?? null;

  const loadEarlier = useCallback(async (): Promise<void> => {
    if (!conversationId || loadingEarlier) return;
    const before = nextBefore ?? oldestRef.current?.id;
    if (!before) return;
    setLoadingEarlier(true);
    setEarlierError(false);
    try {
      const page = await getMessagesPage(conversationId, { before, limit: CHAT_PAGE_SIZE });
      addMessages(page.messages);
      setHasEarlier(page.hasMore);
      setNextBefore(page.nextBefore ?? page.messages[0]?.id ?? null);
    } catch {
      setEarlierError(true);
    } finally {
      setLoadingEarlier(false);
    }
  }, [conversationId, loadingEarlier, nextBefore, addMessages]);

  const pollNewer = useCallback(async (): Promise<void> => {
    if (!conversationId || pollingRef.current) return;
    const newest = newestRef.current;
    if (!newest) {
      void refetchFirstRef.current();
      return;
    }
    pollingRef.current = true;
    try {
      let after = newest.id;
      // A long gap may need more than one page; stop after a few.
      for (let pageCount = 0; pageCount < 3; pageCount += 1) {
        const page = await getMessagesPage(conversationId, { after, limit: 100 });
        addMessages(page.messages);
        if (page.conversation) setPageConversation(page.conversation);
        const last = page.messages[page.messages.length - 1];
        if (!page.hasMore || !last) break;
        after = last.id;
      }
    } catch {
      // The next poll or live event catches up.
    } finally {
      pollingRef.current = false;
    }
  }, [conversationId, addMessages]);

  const interval = usePollWhileFocused({
    connectedMs: CHAT_POLL_CONNECTED_MS,
    disconnectedMs: CHAT_POLL_DISCONNECTED_MS,
    enabled: !!conversationId && firstPage.isSuccess,
  });

  useEffect(() => {
    if (!interval) return undefined;
    const timer = setInterval(() => { void pollNewer(); }, interval);
    return () => clearInterval(timer);
  }, [interval, pollNewer]);

  // One catch-up read each time the live connection comes back.
  useEffect(() => {
    if (!conversationId) return undefined;
    return onSocketStatus((connected) => {
      if (connected) void pollNewer();
    });
  }, [conversationId, pollNewer]);

  const markOwnRead = useCallback((viewerId: string): void => {
    setById((previous) => {
      let changed = false;
      const next = new Map(previous);
      for (const [id, message] of previous) {
        if (message.senderId === viewerId && !message.isRead) {
          next.set(id, { ...message, isRead: true });
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, []);

  const retry = useCallback((): void => { void refetchFirstRef.current(); }, []);

  return {
    messages,
    isLoading: firstPage.isLoading,
    isError: firstPage.isError && messages.length === 0,
    hasEarlier,
    loadingEarlier,
    earlierError,
    pageConversation,
    loadEarlier,
    addMessages,
    markOwnRead,
    pollNewer,
    retry,
  };
}

export default useChatMessages;
