import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage as sendMessageApi,
  markConversationRead,
  type Message,
} from '@/services/messaging.service';
import {
  connectSocket,
  getSocket,
  joinConversation,
  leaveConversation,
  emitTypingStart,
  emitTypingStop,
} from '@/services/socket.service';
import { formatTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export default function ChatScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function initConversation() {
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

    socket.on('new:message', (msg: Message) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => [...prev, msg]);
        void markConversationRead(conversationId);
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
      s?.off('typing:start');
      s?.off('typing:stop');
    };
  }, [conversationId, userId]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !conversationId) return;
    setSending(true);
    try {
      const msg = await sendMessageApi(conversationId, inputText.trim());
      setMessages((prev) => [...prev, msg]);
      setInputText('');
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch {
      Alert.alert('Send Failed', 'Message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  }, [inputText, conversationId]);

  const handleTyping = (text: string) => {
    setInputText(text);
    if (conversationId && text.length > 0) {
      emitTypingStart(conversationId);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        if (conversationId) emitTypingStop(conversationId);
      }, 2000);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === userId;
    return (
      <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
        {item.messageType === 'image' && item.imageUrl && (
          <Text style={styles.imageText}>📷 Photo</Text>
        )}
        <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
          {item.content}
        </Text>
        <Text style={[styles.messageTime, isMine ? styles.myTime : styles.theirTime]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
    );
  };

  if (initError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Failed to set up chat.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Go Back</Text>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Chat</Text>
          {typingUser && <Text style={styles.typingText}>Provider is typing...</Text>}
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
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatIcon}>💬</Text>
            <Text style={styles.emptyChatText}>Start the conversation</Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
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
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.background,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.h3, color: colors.text },
  typingText: { ...typography.caption, color: colors.primary, fontStyle: 'italic' },

  messageList: { padding: spacing.base, paddingBottom: spacing.lg },

  messageBubble: {
    maxWidth: '75%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  myBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  theirBubble: { backgroundColor: colors.backgroundSecondary, alignSelf: 'flex-start' },
  messageText: { ...typography.body },
  myText: { color: '#FFFFFF' },
  theirText: { color: colors.text },
  messageTime: { ...typography.caption, marginTop: spacing.xs },
  myTime: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  theirTime: { color: colors.textTertiary },
  imageText: { ...typography.bodySmall, marginBottom: spacing.xs },

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
  sendIcon: { fontSize: 20, color: '#FFFFFF' },
});
