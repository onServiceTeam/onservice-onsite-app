import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui';
import { Routes, buildRoute } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import {
  createTicket,
  SUPPORT_TYPE_LABELS,
  type SupportTicketType,
  type CreateTicketPayload,
} from '@/services/support.service';

const TYPE_ORDER: SupportTicketType[] = [
  'general_inquiry',
  'booking_issue',
  'payment_issue',
  'provider_no_show',
  'app_bug',
  'account_issue',
];

export default function NewSupportRequestScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const params = useLocalSearchParams<{
    bookingId?: string;
    type?: string;
    priority?: string;
    subject?: string;
    description?: string;
  }>();

  const initialType = (TYPE_ORDER.includes(params.type as SupportTicketType)
    ? (params.type as SupportTicketType)
    : 'general_inquiry');

  const [type, setType] = useState<SupportTicketType>(initialType);
  const initialPriority = (['low', 'medium', 'high', 'urgent'] as const).find(
    (priority) => priority === params.priority,
  );
  const [subject, setSubject] = useState(params.subject ?? '');
  const [description, setDescription] = useState(params.description ?? '');

  const mutation = useMutation({
    mutationFn: (payload: CreateTicketPayload) => createTicket(payload),
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ['support', 'mine'] });
      // Replace so Back from the thread returns to the inbox, not this form.
      router.replace(buildRoute(Routes.SUPPORT.THREAD, { id: ticket.id }));
    },
    onError: () => {
      Alert.alert('Could not send', 'Something went wrong sending your request. Please try again.');
    },
  });

  const submit = (): void => {
    const trimmedSubject = subject.trim();
    const trimmedBody = description.trim();
    if (trimmedSubject.length < 3) {
      Alert.alert('Add a subject', 'Please give your request a short subject so we know what it is about.');
      return;
    }
    if (trimmedBody.length < 5) {
      Alert.alert('Add a few details', 'Please describe what you need help with.');
      return;
    }
    mutation.mutate({
      type,
      subject: trimmedSubject,
      description: trimmedBody,
      bookingId: params.bookingId || undefined,
      priority: initialPriority,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New request</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel={isPhone ? 'Support request form' : 'Desktop support request workspace'}
        >
          {params.bookingId ? (
            <View style={styles.bookingTag}>
              <Text style={styles.bookingTagText}>Linked to booking {params.bookingId.slice(0, 8)}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>What is this about?</Text>
          <View style={styles.typeGrid}>
            {TYPE_ORDER.map((t) => {
              const active = t === type;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                  onPress={() => setType(t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{SUPPORT_TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Provider hasn't arrived"
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            accessibilityLabel="Subject"
          />

          <Text style={styles.label}>Details</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us what happened and how we can help."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={6}
            maxLength={5000}
            textAlignVertical="top"
            accessibilityLabel="Details"
          />

          <Text style={styles.hint}>
            Keeping this conversation in the app means support can see your booking, step in faster, and your messages count as proof if there is ever a dispute.
          </Text>

          <Button
            title={mutation.isPending ? 'Sending…' : 'Send to support'}
            onPress={submit}
            loading={mutation.isPending}
            disabled={mutation.isPending}
          />
        </ScrollView>
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
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: spacing.xl },
  bodyContentWide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
  },
  bookingTag: { alignSelf: 'flex-start', backgroundColor: colors.infoLight, borderRadius: borderRadius.full, paddingHorizontal: spacing.base, paddingVertical: spacing.xs, marginBottom: spacing.base },
  bookingTagText: { ...typography.caption, color: colors.infoDark, fontWeight: '600' },
  label: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  typeChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  typeChipTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  textArea: { minHeight: 120, paddingTop: spacing.md },
  hint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.base, marginBottom: spacing.lg },
});
