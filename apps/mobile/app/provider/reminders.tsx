import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listReminders, addReminder, completeReminder, deleteReminder, type ClientReminder } from '@/services/provider-crm.service';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlarmClock, ChevronLeft } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

export default function RemindersScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['reminders'], queryFn: () => listReminders(), staleTime: 30 * 1000 });
  const invalidate = (): void => { void queryClient.invalidateQueries({ queryKey: ['reminders'] }); };

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const create = useMutation({
    mutationFn: () => addReminder({ title: title.trim(), dueDate: date.trim() }),
    onSuccess: () => { setTitle(''); setDate(''); invalidate(); showToast('Reminder set.', 'success'); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not set the reminder.'), 'error'),
  });
  const done = useMutation({ mutationFn: (id: string) => completeReminder(id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => deleteReminder(id), onSuccess: invalidate });

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date.trim());

  const renderItem = ({ item }: { item: ClientReminder }): React.ReactElement => (
    <View style={[styles.card, item.status === 'done' && styles.cardDone]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, item.status === 'done' && styles.strike]}>{item.title}</Text>
        <Text style={styles.meta}>
          due {item.dueDate}{item.customerName ? ` · ${item.customerName}` : ''}
        </Text>
      </View>
      {item.status === 'pending' ? (
        <TouchableOpacity style={styles.doneBtn} onPress={() => done.mutate(item.id)}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => remove.mutate(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.removeX}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reminders</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.addBox}>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What to follow up on" placeholderTextColor={colors.textTertiary} maxLength={200} />
        <View style={styles.addRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} autoCapitalize="none" />
          <TouchableOpacity style={[styles.addBtn, (!title.trim() || !dateValid) && styles.disabled]} onPress={() => create.mutate()} disabled={!title.trim() || !dateValid || create.isPending}>
            {create.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.addBtnText}>Add</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {q.isLoading ? (
        <View style={styles.body}><SkeletonCard /><SkeletonCard /></View>
      ) : q.isError ? (
        <View style={styles.body}><ErrorState message={getErrorMessage(q.error, 'Could not load reminders.')} onRetry={() => q.refetch()} /></View>
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListEmptyComponent={<EmptyState icon={<AlarmClock size={48} color={colors.textTertiary} />} title="No reminders" description="Set follow-up reminders and we'll nudge you on the day they're due." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { ...typography.h3, color: colors.text },
  addBox: { padding: spacing.base, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.sm },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  addBtn: { backgroundColor: colors.text, borderRadius: borderRadius.md, paddingHorizontal: spacing.base, justifyContent: 'center', alignItems: 'center', minHeight: 40 },
  addBtnText: { ...typography.bodySmall, fontWeight: '700', color: colors.white },
  disabled: { opacity: 0.5 },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.sm, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardDone: { opacity: 0.6 },
  title: { ...typography.body, color: colors.text, fontWeight: '600' },
  strike: { textDecorationLine: 'line-through' },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  doneBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full, backgroundColor: colors.successLight },
  doneBtnText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  removeX: { fontSize: 20, color: colors.error, fontWeight: '700', paddingHorizontal: 4 },
});
