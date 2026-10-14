/**
 * D38 Milestone 2: one chat thread, shared by the customer and provider chat
 * screens (design-threads.md section 7).
 *
 * - Messages run oldest to newest; "Load earlier messages" pages back with
 *   `before`; a live message lands at the bottom.
 * - Photos show their caption under them, for customers and pros alike.
 * - Voice notes play in the bubble, with their length.
 * - A read-only thread (declined, expired or withdrawn quote, another pro
 *   booked, request cancelled, job reassigned) shows why and has no message
 *   box; it can still be read and reported.
 * - "Report" opens an in-app dialog, so it works on the website too.
 * - Sends show at once with their progress and "Not sent. Tap to retry";
 *   a retry reuses the same message id, so it is stored once.
 * - The thread polls only while on screen: every 20 s while the live
 *   connection is down, every 60 s while it is up (useChatMessages).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  getConversation,
  markConversationRead,
  reportMessage,
  sendChatMessage,
  type ChatMessageType,
  type ConversationView,
  type Message,
} from '@/services/messaging.service';
import { emitMarkRead, emitTypingStart, emitTypingStop } from '@/services/socket.service';
import { useChatMessages } from '@/hooks/useChatMessages';
import { requestChatListRefresh } from '@/hooks/useChatInbox';
import { useConversationSocket } from '@/hooks/useConversationSocket';
import { useRequestConfig } from '@/hooks/useRequestConfig';
import { MediaUploadError, uploadPickedMedia, type PickedMedia } from '@/hooks/useJobMediaUploads';
import type { VoiceRecording } from '@/hooks/useVoiceNoteRecorder';
import type { ConversationStateReason } from '@/config/realtime-events';
import { apiErrorInfo } from '@/utils/media-errors';
import { uuidV4 } from '@/utils/uuid';
import { showToast } from '@/lib/toast';
import { ErrorState } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, MessageSquare } from '@/components/icons';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { ReportMessageDialog, type ReportReason } from './ReportMessageDialog';

export interface ChatThreadProps {
  conversation: ConversationView;
  viewerId: string | undefined;
  viewerRole: 'customer' | 'provider';
  accent: string;
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  backLabel: string;
  workspaceLabel: string;
  wide: boolean;
  keepOnAppCopy: string;
  inputLabel: string;
  sendLabel: string;
  photoLabel: string;
  contextPanel?: React.ReactNode;
}

interface PendingSend {
  localId: string;
  clientMessageId: string;
  clientUploadId: string;
  messageType: ChatMessageType;
  content: string;
  picked: PickedMedia | null;
  mediaId: string | null;
  status: 'sending' | 'failed';
  progress: number;
  error: string | null;
}

const READ_ONLY_SEND_COPY = 'This conversation is closed. You can still read it, but not send to it.';

/** Incoming messages within this window are marked read with one request. */
const MARK_READ_DELAY_MS = 1000;

function sendErrorCopy(error: unknown, pending: PendingSend, voiceMaxSeconds: number): string {
  if (error instanceof MediaUploadError) return error.message;
  const info = apiErrorInfo(error);
  switch (info.code) {
    case 'THREAD_READ_ONLY': return READ_ONLY_SEND_COPY;
    case 'THREAD_NOT_FOUND': return 'This conversation is no longer available.';
    case 'MEDIA_INVALID':
      // The server explains why (for example, thread photos not switched on yet).
      return info.message ?? (pending.messageType === 'voice'
        ? 'This voice note could not be sent here. Tap Retry, or record it again.'
        : 'This photo could not be sent here. Tap Retry, or choose another photo.');
    case 'VOICE_TOO_LONG': return `Voice notes can be up to ${voiceMaxSeconds} seconds. Record a shorter one.`;
    case 'CLIENT_MESSAGE_ID_REUSED': return 'Not sent. Remove it and send it again.';
    default: break;
  }
  if (info.status === 429) return 'You are sending messages too fast. Wait a moment, then tap to retry.';
  return 'Not sent. Tap to retry.';
}

export function ChatThread({
  conversation,
  viewerId,
  viewerRole,
  accent,
  title,
  subtitle,
  onBack,
  backLabel,
  workspaceLabel,
  wide,
  keepOnAppCopy,
  inputLabel,
  sendLabel,
  photoLabel,
  contextPanel,
}: ChatThreadProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const config = useRequestConfig();
  const chat = useChatMessages(conversation.id);
  const [threadState, setThreadState] = useState<{ state: string; reason: ConversationStateReason | null }>({
    state: conversation.state ?? 'open',
    reason: conversation.stateReason ?? null,
  });
  const [typing, setTyping] = useState(false);
  const [pending, setPending] = useState<PendingSend[]>([]);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message> | null>(null);
  const nearBottomRef = useRef(true);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setThreadState({ state: conversation.state ?? 'open', reason: conversation.stateReason ?? null });
  }, [conversation.id, conversation.state, conversation.stateReason]);

  useEffect(() => {
    if (chat.pageConversation) {
      setThreadState({ state: chat.pageConversation.state, reason: chat.pageConversation.stateReason ?? null });
    }
  }, [chat.pageConversation]);

  const readOnly = threadState.state === 'read_only';

  const markRead = useCallback((): void => {
    void Promise.resolve(markConversationRead(conversation.id))
      .then(() => {
        // The Messages badge and inbox counts drop shortly, in the same
        // coalesced re-read as the message notice (rate limit: 100 requests
        // per user per 15 minutes).
        requestChatListRefresh(queryClient);
      })
      .catch(() => undefined);
    emitMarkRead(conversation.id);
  }, [conversation.id, queryClient]);

  useEffect(() => { markRead(); }, [markRead]);

  // Messages from the other side that arrive close together are marked read
  // with one request.
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleMarkRead = useCallback((): void => {
    if (markReadTimerRef.current) return;
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      markRead();
    }, MARK_READ_DELAY_MS);
  }, [markRead]);
  useEffect(() => () => {
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = null;
  }, [conversation.id]);

  useConversationSocket(conversation.id, {
    onMessage: (message) => {
      chat.addMessages([message]);
      if (message.senderId !== viewerId) scheduleMarkRead();
    },
    onRead: (readBy) => {
      if (viewerId && readBy !== viewerId) chat.markOwnRead(viewerId);
    },
    onTyping: (userId, isTyping) => {
      if (userId !== viewerId) setTyping(isTyping);
    },
    onState: (payload) => setThreadState({ state: payload.state, reason: payload.stateReason ?? null }),
  });

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  const onTyping = (text: string): void => {
    if (readOnly) return;
    if (text.length > 0) {
      emitTypingStart(conversation.id);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => emitTypingStop(conversation.id), 2000);
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      emitTypingStop(conversation.id);
    }
  };

  const patchPending = useCallback((localId: string, change: Partial<PendingSend>): void => {
    setPending((list) => list.map((item) => (item.localId === localId ? { ...item, ...change } : item)));
  }, []);

  const becameReadOnly = useCallback((): void => {
    setThreadState((current) => ({ state: 'read_only', reason: current.reason }));
    void getConversation(conversation.id)
      .then((fresh) => setThreadState({ state: fresh.state ?? 'read_only', reason: fresh.stateReason ?? null }))
      .catch(() => undefined);
  }, [conversation.id]);

  const runSend = useCallback(async (item: PendingSend): Promise<void> => {
    patchPending(item.localId, { status: 'sending', error: null });
    try {
      let mediaId = item.mediaId;
      if (item.picked && !mediaId) {
        mediaId = await uploadPickedMedia(item.picked, item.clientUploadId, {
          purpose: 'chat',
          conversationId: conversation.id,
          limits: { voiceMaxSeconds: config.jobMedia.voiceMaxSeconds },
          onProgress: (done, total) => patchPending(item.localId, { progress: total > 0 ? done / total : 0 }),
        });
        patchPending(item.localId, { mediaId });
      }
      const message = await sendChatMessage(conversation.id, {
        messageType: item.messageType,
        content: item.content,
        mediaId: mediaId ?? undefined,
        clientMessageId: item.clientMessageId,
      });
      chat.addMessages([message]);
      setPending((list) => list.filter((candidate) => candidate.localId !== item.localId));
      nearBottomRef.current = true;
    } catch (error) {
      // A thread that closed refuses the upload start (403) or the send (409).
      const info = apiErrorInfo(error instanceof MediaUploadError ? error.cause : error);
      if (info.code === 'THREAD_READ_ONLY') becameReadOnly();
      patchPending(item.localId, { status: 'failed', error: sendErrorCopy(error, item, config.jobMedia.voiceMaxSeconds) });
    }
  }, [conversation.id, config.jobMedia.voiceMaxSeconds, chat, patchPending, becameReadOnly]);

  const queueSend = (messageType: ChatMessageType, content: string, picked: PickedMedia | null): void => {
    const item: PendingSend = {
      localId: uuidV4(),
      clientMessageId: uuidV4(),
      clientUploadId: uuidV4(),
      messageType,
      content,
      picked,
      mediaId: null,
      status: 'sending',
      progress: 0,
      error: null,
    };
    setPending((list) => [...list, item]);
    nearBottomRef.current = true;
    void runSend(item);
  };

  const onSendText = (text: string): void => queueSend('text', text, null);
  const onSendPhoto = (picked: PickedMedia, caption: string): void => queueSend('image', caption, picked);
  const onSendVoice = (recording: VoiceRecording, caption: string): void => queueSend('voice', caption, {
    kind: 'voice',
    source: recording.source,
    mime: recording.mime,
    size: recording.size,
    durationMs: recording.durationMs,
    previewUri: recording.uri,
  });

  const submitReport = (reason: ReportReason): void => {
    const messageId = reportingId;
    setReportingId(null);
    if (!messageId) return;
    void reportMessage(messageId, reason)
      .then(() => showToast('Reported. Our team will review it.', 'success'))
      .catch(() => showToast('Could not report this message. Please try again.', 'error'));
  };

  const lastId = chat.messages[chat.messages.length - 1]?.id ?? null;
  const scrolledOnceRef = useRef(false);
  useEffect(() => {
    if (!lastId && pending.length === 0) return;
    if (!scrolledOnceRef.current || nearBottomRef.current) {
      scrolledOnceRef.current = true;
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: scrolledOnceRef.current }), 0);
    }
  }, [lastId, pending.length]);

  const renderPending = (item: PendingSend): React.ReactElement => {
    const label = item.messageType === 'image' ? 'Photo' : item.messageType === 'voice' ? 'Voice note' : null;
    const progress = item.picked && item.status === 'sending' && !item.mediaId
      ? `Uploading ${Math.round(item.progress * 100)}%`
      : item.status === 'sending' ? 'Sending...' : null;
    return (
      <View key={item.localId} style={[styles.pendingBubble, { backgroundColor: accent }]} accessibilityLabel={item.status === 'failed' ? 'Message not sent' : 'Message sending'}>
        {item.messageType === 'image' && item.picked?.previewUri ? (
          <Image source={{ uri: item.picked.previewUri }} style={styles.pendingPhoto} accessibilityLabel="Photo being sent" />
        ) : null}
        {label ? <Text style={styles.pendingText}>{label}</Text> : null}
        {item.content ? <Text style={styles.pendingText}>{item.content}</Text> : null}
        {progress ? <Text style={styles.pendingMeta}>{progress}</Text> : null}
        {item.status === 'failed' ? (
          <View style={styles.pendingActions}>
            <Text style={styles.pendingError}>{item.error}</Text>
            {item.error !== READ_ONLY_SEND_COPY ? (
              <TouchableOpacity
                style={styles.pendingButton}
                onPress={() => { void runSend(item); }}
                accessibilityRole="button"
                accessibilityLabel="Retry sending this message"
              >
                <Text style={styles.pendingButtonText}>Retry</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.pendingButton}
              onPress={() => setPending((list) => list.filter((candidate) => candidate.localId !== item.localId))}
              accessibilityRole="button"
              accessibilityLabel="Remove this unsent message"
            >
              <Text style={styles.pendingButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const header = (
    <View>
      {chat.hasEarlier ? (
        <TouchableOpacity
          style={styles.loadEarlier}
          onPress={() => { void chat.loadEarlier(); }}
          disabled={chat.loadingEarlier}
          accessibilityRole="button"
          accessibilityLabel="Load earlier messages"
          accessibilityState={{ disabled: chat.loadingEarlier, busy: chat.loadingEarlier }}
        >
          {chat.loadingEarlier
            ? <ActivityIndicator size="small" color={accent} />
            : <Text style={[styles.loadEarlierText, { color: accent }]}>Load earlier messages</Text>}
        </TouchableOpacity>
      ) : null}
      {chat.earlierError ? (
        <Text style={styles.inlineError}>Earlier messages could not be loaded. Try again.</Text>
      ) : null}
    </View>
  );

  const empty = chat.isLoading ? (
    <View style={styles.state} accessibilityLabel="Loading conversation history">
      <ActivityIndicator size="small" color={accent} />
    </View>
  ) : chat.isError ? (
    <ErrorState
      compact
      title="Conversation history unavailable"
      message="We couldn't load earlier messages. You can retry here before relying on this conversation."
      onRetry={chat.retry}
    />
  ) : pending.length > 0 ? null : (
    <View style={styles.emptyChat}>
      <MessageSquare size={44} color={colors.textTertiary} />
      <Text style={styles.emptyText}>Start the conversation</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={backLabel}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {typing ? <Text style={[styles.typingText, { color: accent }]}>{`${title} is typing...`}</Text>
            : subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={[styles.workspace, wide && styles.workspaceWide]} accessibilityLabel={workspaceLabel}>
        <View style={styles.pane} accessibilityLabel="Conversation messages and composer">
          <View style={styles.keepOnAppStrip}>
            <Text style={styles.keepOnAppText}>{keepOnAppCopy}</Text>
          </View>
          <FlatList
            ref={listRef}
            style={styles.feed}
            data={chat.messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isMine={item.senderId === viewerId}
                accent={accent}
                onReport={item.messageType === 'system' ? undefined : setReportingId}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              nearBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
            }}
            scrollEventThrottle={100}
            maintainVisibleContentPosition={Platform.OS === 'web' ? undefined : { minIndexForVisible: 0 }}
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            ListFooterComponent={pending.length > 0 ? <View>{pending.map(renderPending)}</View> : null}
          />
          {readOnly ? (
            <ReadOnlyBanner reason={threadState.reason} viewerRole={viewerRole} bottomInset={insets.bottom} />
          ) : (
            <ChatComposer
              accent={accent}
              inputLabel={inputLabel}
              sendLabel={sendLabel}
              photoLabel={photoLabel}
              voiceMaxSeconds={config.jobMedia.voiceMaxSeconds}
              photoMaxBytes={config.jobMedia.photoMaxBytes}
              bottomInset={insets.bottom}
              onSendText={onSendText}
              onSendPhoto={onSendPhoto}
              onSendVoice={onSendVoice}
              onTyping={onTyping}
            />
          )}
        </View>
        {wide && contextPanel ? contextPanel : null}
      </View>

      <ReportMessageDialog visible={reportingId !== null} onReport={submitReport} onCancel={() => setReportingId(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.background,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textSecondary },
  typingText: { ...typography.caption, fontStyle: 'italic' },
  workspace: { flex: 1 },
  workspaceWide: { flexDirection: 'row', alignItems: 'stretch', padding: spacing.lg, gap: spacing.lg },
  pane: { flex: 1, minWidth: 0, backgroundColor: colors.surface },
  feed: { flex: 1 },
  list: { padding: spacing.base, paddingBottom: spacing.lg },
  keepOnAppStrip: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
  },
  keepOnAppText: { ...typography.caption, color: colors.infoDark, lineHeight: 17, textAlign: 'center' },
  loadEarlier: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.base, marginBottom: spacing.sm },
  loadEarlierText: { ...typography.body, fontWeight: '700' },
  inlineError: { ...typography.caption, color: colors.error, textAlign: 'center', marginBottom: spacing.sm },
  state: { paddingVertical: spacing.xxl, alignItems: 'center', justifyContent: 'center' },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textSecondary },
  pendingBubble: { alignSelf: 'flex-end', maxWidth: '78%', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.sm, opacity: 0.85 },
  pendingPhoto: { width: 160, height: 120, borderRadius: borderRadius.md, marginBottom: spacing.xs },
  pendingText: { ...typography.body, color: colors.white },
  pendingMeta: { ...typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  pendingActions: { marginTop: spacing.xs, gap: spacing.xs },
  pendingError: { ...typography.caption, color: colors.white, fontWeight: '700' },
  pendingButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  pendingButtonText: { ...typography.caption, color: colors.white, fontWeight: '700', textDecorationLine: 'underline' },
});

export default ChatThread;
