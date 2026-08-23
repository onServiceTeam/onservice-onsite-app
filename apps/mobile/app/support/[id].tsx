import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, Send } from '@/components/icons';
import { useAuthStore } from '@/stores/auth.store';
import {
  getMyTicket,
  addTicketMessage,
  isTicketOpen,
  SUPPORT_STATUS_LABELS,
  type SupportTicketMessage,
} from '@/services/support.service';
import { useResponsive } from '@/hooks/useResponsive';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SupportThreadScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const myUserId = useAuthStore((s) => s.user?.id);
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');

  const ticketQuery = useQuery({
    queryKey: ['support', 'ticket', id],
    queryFn: () => getMyTicket(id),
    enabled: !!id,
    refetchInterval: 20_000, // light polling so support replies appear
  });

  const mutation = useMutation({
    mutationFn: (message: string) => addTicketMessage(id, message),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['support', 'ticket', id] });
      void queryClient.invalidateQueries({ queryKey: ['support', 'mine'] });
    },
  });

  const ticket = ticketQuery.data;
  const open = ticket ? isTicketOpen(ticket.status) : false;

  useEffect(() => {
    if (ticket) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ticket?.messages?.length, ticket]);

  const send = (): void => {
    const text = draft.trim();
    if (!text || mutation.isPending) return;
    mutation.mutate(text);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title} numberOfLines={1}>{ticket?.subject ?? 'Support'}</Text>
          {ticket ? (
            <Text style={styles.subtitle}>
              {ticket.ticket_number} · {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        {ticketQuery.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : ticketQuery.isError || !ticket ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>We could not open this request.</Text>
            <TouchableOpacity onPress={() => ticketQuery.refetch()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.thread}
              contentContainerStyle={[styles.threadContent, !isPhone && styles.threadContentWide]}
              showsVerticalScrollIndicator={false}
              accessibilityLabel={isPhone ? 'Support conversation' : 'Desktop support conversation workspace'}
            >
              {/* The ticket body is the opening message from the customer. */}
              <View style={[styles.bubbleRow, styles.bubbleRowMine]}>
                <View style={[styles.bubble, !isPhone && styles.bubbleWide, styles.bubbleMine]}>
                  <Text style={[styles.bubbleText, styles.bubbleTextMine]}>{ticket.description}</Text>
                  <Text style={[styles.bubbleTime, styles.bubbleTimeMine]}>{formatTime(ticket.created_at)}</Text>
                </View>
              </View>

              {ticket.messages.map((m: SupportTicketMessage) => {
                const mine = m.sender_id === myUserId;
                return (
                  <View key={m.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                    <View style={[styles.bubble, !isPhone && styles.bubbleWide, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {!mine ? (
                        <Text style={styles.senderName}>
                          {m.sender_first_name ? `${m.sender_first_name} · Support` : 'Support'}
                        </Text>
                      ) : null}
                      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{m.message}</Text>
                      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(m.created_at)}</Text>
                    </View>
                  </View>
                );
              })}

              {!open ? (
                <View style={styles.closedNote}>
                  <Text style={styles.closedNoteText}>
                    This request is {SUPPORT_STATUS_LABELS[ticket.status].toLowerCase()}. Start a new request if you still need help.
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {open ? (
              <View style={[styles.composer, !isPhone && styles.composerWide]}>
                {mutation.isError ? (
                  <Text style={styles.sendError} accessibilityRole="alert">
                    Message not sent. Check your connection and try again.
                  </Text>
                ) : null}
                <TextInput
                  style={styles.composerInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Write a message…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={5000}
                  accessibilityLabel="Message"
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!draft.trim() || mutation.isPending) && styles.sendBtnDisabled]}
                  onPress={send}
                  disabled={!draft.trim() || mutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  {mutation.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Send size={20} color={colors.white} />}
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTextWrap: { flex: 1 },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  thread: { flex: 1 },
  threadContent: { padding: spacing.base, paddingBottom: spacing.lg },
  threadContentWide: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: spacing.xl },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: borderRadius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  bubbleWide: { maxWidth: '70%' },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: borderRadius.sm },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderBottomLeftRadius: borderRadius.sm },
  senderName: { ...typography.caption, color: colors.primary, fontWeight: '700', marginBottom: 2 },
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { ...typography.caption, color: colors.textTertiary, marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
  closedNote: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, padding: spacing.base, marginTop: spacing.sm },
  closedNoteText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  composer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerWide: { width: '100%', maxWidth: 900, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  sendError: { width: '100%', ...typography.caption, color: colors.error, marginBottom: spacing.xs },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
});
