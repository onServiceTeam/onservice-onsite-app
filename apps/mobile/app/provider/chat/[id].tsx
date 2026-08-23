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
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
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
import { LazyImage } from '@/components/ui';
import { formatTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MessageSquare, Camera, Check, CheckCheck, Send, ChevronLeft } from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';

import * as ImagePicker from 'expo-image-picker';

export default function ProviderChatScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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

  // BUG-PHASE79-01 fix — pre-fix the chat header read "Chat with
  // Customer" / "Customer is typing..." with no name. The provider
  // had no idea who the message was from while looking at the
  // screen — they had to swipe back to the job details to find out.
  // Phase 77 added customerName to the booking response; query the
  // booking here to surface the real name in the header.
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId),
    enabled: !!bookingId,
    staleTime: 5 * 60 * 1000,
  });
  const customerName = bookingQuery.data?.customerName ?? 'Customer';

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

    socket.on('new:message', (msg: Message) => {
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
    });

    socket.on('messages:read', (data: { conversationId: string; readBy: string }) => {
      if (data.conversationId === conversationId && data.readBy !== userId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === userId && !m.isRead ? { ...m, isRead: true } : m,
          ),
        );
      }
    });

    socket.on('typing:start', (data: { userId: string }) => {
      if (data.userId !== userId) setTypingUser(true);
    });

    socket.on('typing:stop', (data: { userId: string }) => {
      if (data.userId !== userId) setTypingUser(false);
    });

    return () => {
      leaveConversation(conversationId);
      const s = getSocket();
      s?.off('new:message');
      s?.off('messages:read');
      s?.off('typing:start');
      s?.off('typing:stop');
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
        const msg = await sendMessageApi(conversationId, 'Photo', 'image', uploaded[0]!.url);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    } catch {
      showToast('Could not send the photo. Please try again.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }, [conversationId]);

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
    const submit = (reason: string): void => {
      void reportMessage(messageId, reason)
        .then(() => showToast('Reported. Our team will review it.', 'success'))
        .catch(() => showToast('Could not report this message. Please try again.', 'error'));
    };
    Alert.alert('Report message', 'Why are you reporting this message?', [
      { text: 'Spam', onPress: () => submit('spam') },
      { text: 'Harassment or abuse', onPress: () => submit('harassment') },
      { text: 'Scam / asking to pay off the app', onPress: () => submit('scam_or_off_platform') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const renderMessage = ({ item }: { item: Message }): React.ReactElement => {
    const isMine = item.senderId === userId;
    const canReport = !isMine && item.messageType !== 'system';
    return (
      <TouchableOpacity
        activeOpacity={canReport ? 0.7 : 1}
        onLongPress={canReport ? () => handleReport(item.id) : undefined}
        delayLongPress={350}
        style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}
        accessibilityHint={canReport ? 'Long press to report this message' : undefined}
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
      </TouchableOpacity>
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
        <TouchableOpacity onPress={retryInit} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={[styles.retryButton, { marginTop: spacing.sm }]}>
          <Text style={[styles.retryText, { color: colors.textSecondary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!conversationId) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{customerName}</Text>
          {typingUser && <Text style={styles.typingText}>{customerName} is typing...</Text>}
        </View>
      </View>

      <FlatList
        ref={flatListRef}
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
            tintColor={colors.secondary}
          />
        }
        ListHeaderComponent={
          messagesQuery.isError ? (
            <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, margin: 16, marginBottom: 0 }}>
              <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load messages. Pull down to refresh.</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <MessageSquare size={48} color={colors.textTertiary} style={styles.emptyChatIcon} />
            <Text style={styles.emptyChatText}>Start the conversation</Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={handlePhotoSend}
          disabled={uploadingPhoto || sending}
        >
          {uploadingPhoto ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : (
            <Camera size={22} color={colors.secondary} />
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
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          <Send size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' as const },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },

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
  backIconText: { fontSize: 24, color: colors.text },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.text },
  typingText: { ...typography.caption, color: colors.secondary, fontStyle: 'italic' },

  messageList: { padding: spacing.base, paddingBottom: spacing.lg },

  messageBubble: {
    maxWidth: '75%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  myBubble: { backgroundColor: colors.secondary, alignSelf: 'flex-end' },
  theirBubble: { backgroundColor: colors.backgroundSecondary, alignSelf: 'flex-start' },
  messageText: { ...typography.body },
  myText: { color: colors.white },
  theirText: { color: colors.text },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.xs, gap: 4 },
  messageTime: { ...typography.caption },
  myTime: { color: 'rgba(255,255,255,0.6)' },
  theirTime: { color: colors.textTertiary },
  readReceipt: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  chatImage: { width: 200, height: 150, borderRadius: borderRadius.md, marginBottom: spacing.xs },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatIcon: { marginBottom: spacing.md },
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
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 20, color: colors.white },
});
