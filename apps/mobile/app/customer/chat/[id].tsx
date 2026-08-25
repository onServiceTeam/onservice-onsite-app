import React, { useState, useEffect, useRef, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { MessageSquare, Camera, Check, CheckCheck, Send, ChevronLeft } from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { getBookingById } from '@/services/booking.service';
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage as sendMessageApi,
  markConversationRead,
  reportMessage,
  type Message,
} from '@/services/messaging.service';
import {
  connectSocket,
  getSocket,
  joinConversation,
  leaveConversation,
  emitTypingStart,
  emitTypingStop,
  emitMarkRead,
} from '@/services/socket.service';
import { uploadImages } from '@/services/upload.service';
import { LazyImage, StatusBadge } from '@/components/ui';
import { formatDateTime, formatTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

import * as ImagePicker from 'expo-image-picker';

export default function ChatScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const { isPhone } = useResponsive();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function initConversation(): Promise<void> {
      try {
        setInitError(false);
        const conversations = await getConversations();
        let conv = conversations.find((c) => c.bookingId === bookingId);
        if (!conv) {
          conv = await createConversation(bookingId);
        }
        setConversationId(conv.id);
      } catch {
        setInitError(true);
      }
    }
    void initConversation();
  }, [bookingId]);

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const result = await getMessages(conversationId, 1, 100);
      return result.messages;
    },
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });

  // BUG-PHASE79-02 fix — pre-fix the chat header read just "Chat"
  // / "Provider is typing..." with no name. The customer had no
  // idea who the provider was while looking at the screen. Pull
  // the booking so the header shows the provider's actual name.
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId),
    enabled: !!bookingId,
    staleTime: 5 * 60 * 1000,
  });
  const providerName = bookingQuery.data?.providerName ?? 'Provider';

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data.slice().reverse());
    }
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!conversationId) return;

    const socket = connectSocket();
    joinConversation(conversationId);
    void markConversationRead(conversationId);
    emitMarkRead(conversationId);

    const onNewMessage = (msg: Message): void => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.senderId !== userId) {
          void markConversationRead(conversationId);
          emitMarkRead(conversationId);
        }
      }
    };

    const onMessagesRead = (data: { conversationId: string; readBy: string }): void => {
      if (data.conversationId === conversationId && data.readBy !== userId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === userId && !m.isRead ? { ...m, isRead: true } : m,
          ),
        );
      }
    };

    const onTypingStart = (data: { userId: string }): void => {
      if (data.userId !== userId) setTypingUser(true);
    };

    const onTypingStop = (data: { userId: string }): void => {
      if (data.userId !== userId) setTypingUser(false);
    };

    socket.on('new:message', onNewMessage);
    socket.on('messages:read', onMessagesRead);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      leaveConversation(conversationId);
      const s = getSocket();
      s?.off('new:message', onNewMessage);
      s?.off('messages:read', onMessagesRead);
      s?.off('typing:start', onTypingStart);
      s?.off('typing:stop', onTypingStop);
    };
  }, [conversationId, userId]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !conversationId) return;
    setSending(true);
    try {
      const msg = await sendMessageApi(conversationId, inputText.trim());
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setInputText('');
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch {
      showToast('Message could not be sent. Please try again.', 'error');
    } finally {
      setSending(false);
    }
  }, [inputText, conversationId]);

  const handlePhotoSend = useCallback(async () => {
    if (!conversationId) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('Please allow photo library access to send images.', 'warning');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const uploaded = await uploadImages([result.assets[0].uri], 'chat');
      if (uploaded.length > 0) {
        const caption = inputText.trim() || 'Photo';
        const msg = await sendMessageApi(conversationId, caption, 'image', uploaded[0]!.url);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setInputText('');
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    } catch {
      showToast('Could not send the photo. Please try again.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }, [conversationId, inputText]);

  const handleTyping = (text: string): void => {
    setInputText(text);
    if (!conversationId) return;
    if (text.length > 0) {
      emitTypingStart(conversationId);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        emitTypingStop(conversationId);
      }, 2000);
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      emitTypingStop(conversationId);
    }
  };

  const handleReport = useCallback((messageId: string) => {
    setReportingMessageId(messageId);
  }, []);

  const submitReport = useCallback((reason: string): void => {
    if (!reportingMessageId) return;
    const messageId = reportingMessageId;
    setReportingMessageId(null);
    void reportMessage(messageId, reason)
      .then(() => showToast('Reported. Our team will review it.', 'success'))
      .catch(() => showToast('Could not report this message. Please try again.', 'error'));
  }, [reportingMessageId]);

  const renderMessage = ({ item }: { item: Message }): React.ReactElement => {
    const isMine = item.senderId === userId;
    // You can report the other party's real messages (not your own, not system).
    const canReport = !isMine && item.messageType !== 'system';
    return (
      <View
        style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}
      >
        {item.messageType === 'image' && item.imageUrl && (
          <LazyImage source={item.imageUrl} style={styles.chatImage} contentFit="cover" accessibilityLabel="Chat photo" />
        )}
        {item.content && !(item.messageType === 'image' && item.imageUrl) && (
          <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
            {item.content}
          </Text>
        )}
        <View style={styles.messageFooter}>
          <Text style={[styles.messageTime, isMine ? styles.myTime : styles.theirTime]}>
            {formatTime(item.createdAt)}
          </Text>
          {isMine && (item.isRead
            ? <CheckCheck size={12} color="rgba(255,255,255,0.7)" accessibilityLabel="Read" />
            : <Check size={12} color="rgba(255,255,255,0.7)" accessibilityLabel="Sent" />)}
        </View>
        {canReport && (
          <TouchableOpacity
            style={styles.reportMessageButton}
            onPress={() => handleReport(item.id)}
            accessibilityRole="button"
            accessibilityLabel="Report this message"
          >
            <Text style={styles.reportMessageText}>Report</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const retryInit = useCallback((): void => {
    setInitError(false);
    setConversationId(null);
    (async (): Promise<void> => {
      try {
        const conversations = await getConversations();
        let conv = conversations.find((c) => c.bookingId === bookingId);
        if (!conv) {
          conv = await createConversation(bookingId);
        }
        setConversationId(conv.id);
      } catch {
        setInitError(true);
      }
    })();
  }, [bookingId]);

  if (initError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Failed to set up chat.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry opening booking chat" onPress={retryInit} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back from unavailable booking chat" onPress={() => router.back()} style={[styles.retryButton, { marginTop: spacing.sm }]}>
          <Text style={[styles.retryText, { color: colors.textSecondary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!conversationId) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Setting up chat...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back from provider chat">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{providerName}</Text>
          {typingUser && <Text style={styles.typingText}>{providerName} is typing...</Text>}
        </View>
      </View>

      <View
        style={[styles.chatWorkspace, !isPhone && styles.chatWorkspaceWide]}
        accessibilityLabel={isPhone ? 'Customer conversation' : 'Customer conversation workspace'}
      >
      <View style={styles.conversationPane} accessibilityLabel="Conversation messages and composer">
      <FlatList
        ref={flatListRef}
        style={styles.messageFeed}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        refreshControl={
          <RefreshControl
            refreshing={messagesQuery.isRefetching}
            onRefresh={() => void messagesQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {messagesQuery.isError ? (
              <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, margin: 16, marginBottom: 0 }}>
                <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load messages. Pull down to refresh.</Text>
              </View>
            ) : null}
            {/* Keep-it-on-the-app nudge: factual support and evidence value,
                without advertising the deferred guarantee product. */}
            <View style={styles.keepOnAppStrip}>
              <Text style={styles.keepOnAppText}>
                Keep your conversation here. On-app chat stays attached to the booking so support can review the service record and any dispute evidence.
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <MessageSquare size={44} color={colors.textTertiary} />
            <Text style={styles.emptyChatText}>Start the conversation</Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={handlePhotoSend}
          disabled={uploadingPhoto || sending}
          accessibilityRole="button"
          accessibilityLabel="Send a photo"
          accessibilityState={{ disabled: uploadingPhoto || sending, busy: uploadingPhoto }}
        >
          {uploadingPhoto ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Camera size={22} color={colors.primary} />
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={handleTyping}
          placeholder="Type a message..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
          accessibilityLabel="Message to provider"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !inputText.trim() || sending, busy: sending }}
        >
          <Send size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
      </View>

      {!isPhone && (
        <View style={styles.contextPanel} accessibilityLabel="Booking conversation context">
          <Text style={styles.contextEyebrow}>BOOKING CONTEXT</Text>
          {bookingQuery.data ? (
            <>
              <Text style={styles.contextTitle}>
                {bookingQuery.data.serviceName ?? bookingQuery.data.categoryName ?? 'Service booking'}
              </Text>
              <StatusBadge status={bookingQuery.data.status} size="md" />
              <View style={styles.contextSection}>
                <Text style={styles.contextLabel}>Scheduled</Text>
                <Text style={styles.contextValue}>{formatDateTime(bookingQuery.data.scheduledAt)}</Text>
              </View>
              <View style={styles.contextSection}>
                <Text style={styles.contextLabel}>Service location</Text>
                <Text style={styles.contextValue}>
                  {[bookingQuery.data.address, bookingQuery.data.barangay, bookingQuery.data.city].filter(Boolean).join(', ')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.contextAction}
                onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId }))}
                accessibilityRole="button"
                accessibilityLabel="Open booking details from chat"
              >
                <Text style={styles.contextActionText}>View booking details</Text>
              </TouchableOpacity>
              {['paid', 'provider_en_route', 'provider_arrived', 'in_progress'].includes(bookingQuery.data.status) && (
                <TouchableOpacity
                  style={[styles.contextAction, styles.contextActionSecondary]}
                  onPress={() => router.push({
                    pathname: Routes.CUSTOMER.BOOKING_TRACKER,
                    params: { bookingId },
                  })}
                  accessibilityRole="button"
                  accessibilityLabel="Open live job tracker from chat"
                >
                  <Text style={styles.contextActionSecondaryText}>Open booking tracker</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.contextUnavailable}>
              {bookingQuery.isError ? 'Booking context is unavailable. You can still use this conversation.' : 'Loading booking context...'}
            </Text>
          )}
        </View>
      )}
      </View>

      <Modal
        visible={reportingMessageId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReportingMessageId(null)}
      >
        <View style={styles.reportOverlay}>
          <View style={styles.reportDialog} accessibilityRole="alert" accessibilityLabel="Report message reason">
            <Text style={styles.reportTitle}>Report message</Text>
            <Text style={styles.reportCopy}>Choose the reason that best describes the message. Support receives the exact reported message and booking context.</Text>
            <TouchableOpacity style={styles.reportReason} onPress={() => submitReport('spam')} accessibilityRole="button" accessibilityLabel="Report reason spam">
              <Text style={styles.reportReasonText}>Spam</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportReason} onPress={() => submitReport('harassment')} accessibilityRole="button" accessibilityLabel="Report reason harassment or abuse">
              <Text style={styles.reportReasonText}>Harassment or abuse</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportReason} onPress={() => submitReport('scam_or_off_platform')} accessibilityRole="button" accessibilityLabel="Report reason scam or off-app payment request">
              <Text style={styles.reportReasonText}>Scam or asking to pay off the app</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportCancel} onPress={() => setReportingMessageId(null)} accessibilityRole="button" accessibilityLabel="Cancel message report">
              <Text style={styles.reportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' as const },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.background,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.text },
  typingText: { ...typography.caption, color: colors.primary, fontStyle: 'italic' },

  chatWorkspace: { flex: 1 },
  chatWorkspaceWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  conversationPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
  },
  messageFeed: { flex: 1 },
  contextPanel: {
    width: 320,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  contextEyebrow: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', letterSpacing: 0.8 },
  contextTitle: { ...typography.h2, color: colors.text },
  contextSection: { gap: spacing.xs },
  contextLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase' },
  contextValue: { ...typography.body, color: colors.text },
  contextUnavailable: { ...typography.body, color: colors.textSecondary },
  contextAction: {
    minHeight: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  contextActionText: { ...typography.body, color: colors.white, fontWeight: '700' },
  contextActionSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  contextActionSecondaryText: { ...typography.body, color: colors.primary, fontWeight: '700' },

  messageList: { padding: spacing.base, paddingBottom: spacing.lg },
  keepOnAppStrip: { backgroundColor: colors.infoLight, borderRadius: borderRadius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, marginHorizontal: spacing.base, marginBottom: spacing.sm },
  keepOnAppText: { ...typography.caption, color: colors.infoDark, lineHeight: 17, textAlign: 'center' },

  messageBubble: {
    maxWidth: '75%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  myBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  theirBubble: { backgroundColor: colors.backgroundSecondary, alignSelf: 'flex-start' },
  messageText: { ...typography.body },
  myText: { color: colors.white },
  theirText: { color: colors.text },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.xs, gap: 4 },
  messageTime: { ...typography.caption },
  myTime: { color: 'rgba(255,255,255,0.6)' },
  theirTime: { color: colors.textTertiary },
  readReceipt: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  reportMessageButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  reportMessageText: { ...typography.caption, color: colors.error, fontWeight: '700' },
  chatImage: { width: 200, height: 150, borderRadius: borderRadius.md, marginBottom: spacing.xs },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyChatText: { ...typography.body, color: colors.textSecondary },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
  photoButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  photoIcon: { fontSize: 22 },
  input: {
    ...typography.body,
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    maxHeight: 100,
    color: colors.text,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 20, color: colors.white },
  reportOverlay: { flex: 1, backgroundColor: 'rgba(5,26,62,0.48)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  reportDialog: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  reportTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  reportCopy: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  reportReason: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.base, marginBottom: spacing.sm },
  reportReasonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  reportCancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  reportCancelText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
});
