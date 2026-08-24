import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getClientDetail, addClientNote, deleteClientNote, addReminder, completeReminder,
} from '@/services/provider-crm.service';
import { formatPHP } from '@/utils/currency';
import { formatRelative, isRealCalendarDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
import { SkeletonCard, ErrorState } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';

export default function ClientDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const customerId = id ?? '';
  const { isPhone } = useResponsive();

  const q = useQuery({ queryKey: ['client', customerId], queryFn: () => getClientDetail(customerId), enabled: !!customerId });
  const invalidate = (): void => { void queryClient.invalidateQueries({ queryKey: ['client', customerId] }); };

  const [noteBody, setNoteBody] = useState('');
  const [remTitle, setRemTitle] = useState('');
  const [remDate, setRemDate] = useState('');

  const addNote = useMutation({
    mutationFn: () => addClientNote(customerId, noteBody.trim()),
    onSuccess: () => { setNoteBody(''); invalidate(); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not save the note.'), 'error'),
  });
  const removeNote = useMutation({
    mutationFn: (noteId: string) => deleteClientNote(noteId),
    onSuccess: invalidate,
    onError: (e) => showToast(getErrorMessage(e, 'Could not delete the note.'), 'error'),
  });
  const addRem = useMutation({
    mutationFn: () => addReminder({ customerId, title: remTitle.trim(), dueDate: remDate.trim() }),
    onSuccess: () => { setRemTitle(''); setRemDate(''); invalidate(); showToast('Reminder set.', 'success'); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not set the reminder.'), 'error'),
  });
  const doneRem = useMutation({
    mutationFn: (reminderId: string) => completeReminder(reminderId),
    onSuccess: invalidate,
    onError: (e) => showToast(getErrorMessage(e, 'Could not update the reminder.'), 'error'),
  });

  const dateValid = isRealCalendarDate(remDate.trim());

  if (q.isLoading) {
    return <SafeAreaView style={styles.container} edges={['top']}><View style={styles.body}><SkeletonCard /><SkeletonCard /></View></SafeAreaView>;
  }
  if (q.isError || !q.data) {
    return <SafeAreaView style={styles.container} edges={['top']}><View style={styles.body}><ErrorState message="Could not load this client." onRetry={() => q.refetch()} /></View></SafeAreaView>;
  }
  const client = q.data;
  const completedCount = client.bookings.filter((booking) =>
    ['confirmed', 'payout_ready', 'paid_out', 'completed_by_provider'].includes(booking.status),
  ).length;
  const totalJobValue = client.bookings.reduce((sum, booking) => sum + booking.servicePrice, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{client.customerName}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Client record</Text>
          <Text style={styles.summaryText}>
            {client.bookings.length} job{client.bookings.length === 1 ? '' : 's'} · {completedCount} completed · {formatPHP(totalJobValue)} gross service value
          </Text>
          <Text style={styles.hint}>Notes and reminders are private to your provider account.</Text>
        </View>

        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Client record' : 'Wide client relationship workspace'}
        >
        <View style={[styles.workspaceColumn, !isPhone && styles.workspaceColumnPrimary]}>
        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.hint}>Private to you. The customer never sees these.</Text>
          {client.notes.map((n) => (
            <View key={n.id} style={styles.noteRow}>
              <Text style={styles.noteBody}>{n.body}</Text>
              <TouchableOpacity onPress={() => removeNote.mutate(n.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.removeX}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput style={styles.input} value={noteBody} onChangeText={setNoteBody} placeholder="Add a note (e.g. prefers mornings)" placeholderTextColor={colors.textTertiary} multiline maxLength={4000} />
            <TouchableOpacity style={[styles.addBtn, !noteBody.trim() && styles.disabled]} onPress={() => addNote.mutate()} disabled={!noteBody.trim() || addNote.isPending}>
              {addNote.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.addBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Reminders */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Follow-up reminders</Text>
          {client.reminders.filter((r) => r.status === 'pending').map((r) => (
            <View key={r.id} style={styles.remRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.remTitle}>{r.title}</Text>
                <Text style={styles.remDate}>due {r.dueDate}</Text>
              </View>
              <TouchableOpacity style={styles.doneBtn} onPress={() => doneRem.mutate(r.id)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.remForm}>
            <TextInput style={styles.input} value={remTitle} onChangeText={setRemTitle} placeholder="Reminder (e.g. follow up on repair)" placeholderTextColor={colors.textTertiary} maxLength={200} />
            <View style={styles.remFormRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={remDate} onChangeText={setRemDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} autoCapitalize="none" />
              <TouchableOpacity style={[styles.addBtn, (!remTitle.trim() || !dateValid) && styles.disabled]} onPress={() => addRem.mutate()} disabled={!remTitle.trim() || !dateValid || addRem.isPending}>
                {addRem.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.addBtnText}>Set</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </View>

        {/* History */}
        <View style={[styles.card, styles.historyCard, !isPhone && styles.workspaceColumnSecondary]}>
          <Text style={styles.sectionTitle}>Job history</Text>
          {client.bookings.length === 0 ? (
            <Text style={styles.hint}>No jobs yet.</Text>
          ) : (
            client.bookings.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={styles.histRow}
                onPress={() => router.push(`/provider/job/${b.id}`)}
                accessibilityLabel={`Open ${b.categoryName ?? 'service'} job`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.histCat}>{b.categoryName ?? 'Service'}</Text>
                  <Text style={styles.histMeta}>{b.status.replace(/_/g, ' ')} · {formatRelative(b.createdAt)}</Text>
                </View>
                <View style={styles.histAmountWrap}>
                  <Text style={styles.histValue}>{formatPHP(b.servicePrice)}</Text>
                  <Text style={styles.histOpen}>Open ›</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  headerTitle: { ...typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md },
  bodyWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.xl },
  summaryCard: { backgroundColor: colors.infoLight, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  summaryText: { ...typography.bodySmall, color: colors.text, fontWeight: '600', marginBottom: spacing.xs },
  workspace: { gap: spacing.md },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  workspaceColumn: { gap: spacing.md },
  workspaceColumnPrimary: { flex: 1.1, minWidth: 0 },
  workspaceColumnSecondary: { flex: 0.9, minWidth: 320 },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  historyCard: { alignSelf: 'stretch' },
  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 4 },
  hint: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  noteBody: { ...typography.bodySmall, color: colors.text, flex: 1 },
  removeX: { fontSize: 20, color: colors.error, fontWeight: '700', paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start' },
  input: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  addBtn: { backgroundColor: colors.text, borderRadius: borderRadius.md, paddingHorizontal: spacing.base, justifyContent: 'center', alignItems: 'center', minHeight: 40 },
  addBtnText: { ...typography.bodySmall, fontWeight: '700', color: colors.white },
  disabled: { opacity: 0.5 },
  remRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  remTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  remDate: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  doneBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full, backgroundColor: colors.successLight },
  doneBtnText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  remForm: { gap: spacing.sm, marginTop: spacing.sm },
  remFormRow: { flexDirection: 'row', gap: spacing.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  histCat: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  histMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1, textTransform: 'capitalize' },
  histValue: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  histAmountWrap: { alignItems: 'flex-end' },
  histOpen: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: 2 },
});
