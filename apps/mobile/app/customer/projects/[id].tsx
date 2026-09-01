import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProject, addMilestone, updateMilestone, addSelection,
  type ProjectMilestone, type MilestoneStatus,
} from '@/services/project.service';
import { useAuthStore } from '@/stores/auth.store';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
import { SkeletonCard, ErrorState } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';

const MS_LABEL: Record<MilestoneStatus, string> = { pending: 'Pending', in_progress: 'In progress', completed: 'Completed' };
const MS_COLOR: Record<MilestoneStatus, string> = { pending: colors.textSecondary, in_progress: colors.warning, completed: colors.success };
const NEXT_STATUS: Record<Exclude<MilestoneStatus, 'completed'>, MilestoneStatus> = {
  pending: 'in_progress',
  in_progress: 'completed',
};

export default function ProjectDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const { isPhone } = useResponsive();

  const q = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id ?? ''), enabled: !!id });
  const isOwner = !!q.data && q.data.customerId === userId;

  const [showAddMs, setShowAddMs] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [showAddSel, setShowAddSel] = useState(false);
  const [selCat, setSelCat] = useState('');
  const [selLabel, setSelLabel] = useState('');
  const [selValue, setSelValue] = useState('');

  const invalidate = (): void => { void queryClient.invalidateQueries({ queryKey: ['project', id] }); };

  const advanceMs = useMutation({
    mutationFn: (m: ProjectMilestone) => {
      if (m.status === 'completed') return Promise.resolve(m);
      return updateMilestone(m.id, { status: NEXT_STATUS[m.status] });
    },
    onSuccess: invalidate,
    onError: (e) => showToast(getErrorMessage(e, 'Could not update the milestone.'), 'error'),
  });

  const createMs = useMutation({
    mutationFn: () => addMilestone(id ?? '', { title: msTitle.trim(), sortOrder: q.data?.milestones.length ?? 0 }),
    onSuccess: () => { setMsTitle(''); setShowAddMs(false); invalidate(); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not add the milestone.'), 'error'),
  });

  const createSel = useMutation({
    mutationFn: () => addSelection(id ?? '', { category: selCat.trim(), label: selLabel.trim(), value: selValue.trim() }),
    onSuccess: () => { setSelCat(''); setSelLabel(''); setSelValue(''); setShowAddSel(false); invalidate(); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not add the choice.'), 'error'),
  });

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.body}>
          <ErrorState
            title="Project unavailable"
            message="This link does not identify a project. Return to Projects and open it again."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (q.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.body}><SkeletonCard /><SkeletonCard /></View>
      </SafeAreaView>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.body}><ErrorState message="Could not load this project." onRetry={() => q.refetch()} /></View>
      </SafeAreaView>
    );
  }

  const project = q.data;
  const total = project.milestones.length;
  const done = project.milestones.filter((m) => m.status === 'completed').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back from project"
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{project.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}
        accessibilityLabel={!isPhone ? 'Wide project planning workspace' : undefined}
      >
        <View style={styles.planNotice}>
          <Text style={styles.planNoticeTitle}>Planning only · {project.status.replace('_', ' ')}</Text>
          <Text style={styles.planNoticeText}>
            {project.providerId
              ? 'This planning record has a legacy provider link, but it is not a provider invitation, booking, quote, or payment. The milestones, budgets, choices, and documents here remain planning records.'
              : 'This project is not a booking and has no provider or payment link. Milestones, budgets, choices, and documents here are your planning records.'}
          </Text>
        </View>

        <View style={[styles.workspace, !isPhone && styles.workspaceWide]}>
          <View style={styles.primaryColumn}>
            {project.description ? <Text style={styles.description}>{project.description}</Text> : null}

            <View style={styles.card}>
              <View style={styles.progressTop}>
                <Text style={styles.sectionTitle}>Progress</Text>
                <Text style={styles.progressPct}>{done}/{total} done</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Choices &amp; materials</Text>
                {isOwner && (
                  <TouchableOpacity
                    style={styles.addAction}
                    accessibilityRole="button"
                    accessibilityLabel={`${showAddSel ? 'Hide' : 'Show'} add choice form`}
                    accessibilityState={{ expanded: showAddSel }}
                    onPress={() => setShowAddSel((v) => !v)}
                  ><Text style={styles.addLink}>+ Add</Text></TouchableOpacity>
                )}
              </View>
              {project.selections.length === 0 ? (
                <Text style={styles.empty}>No choices recorded yet (door type, paint colour, materials…).</Text>
              ) : (
                project.selections.map((s) => (
                  <View key={s.id} style={styles.selRow}>
                    <Text style={styles.selLabel}>{s.category} · {s.label}</Text>
                    <Text style={styles.selValue}>{s.value}{s.detail ? ` (${s.detail})` : ''}</Text>
                  </View>
                ))
              )}
              {showAddSel && (
                <View style={styles.selForm}>
                  <TextInput accessibilityLabel="Choice category" style={styles.inlineInput} value={selCat} onChangeText={setSelCat} placeholder="Category (e.g. Door)" placeholderTextColor={colors.textTertiary} maxLength={80} />
                  <TextInput accessibilityLabel="Choice label" style={styles.inlineInput} value={selLabel} onChangeText={setSelLabel} placeholder="Label (e.g. Material)" placeholderTextColor={colors.textTertiary} maxLength={120} />
                  <TextInput accessibilityLabel="Choice value" style={styles.inlineInput} value={selValue} onChangeText={setSelValue} placeholder="Value (e.g. Solid oak)" placeholderTextColor={colors.textTertiary} maxLength={200} />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Add project choice"
                    accessibilityState={{ disabled: !selCat.trim() || !selLabel.trim() || !selValue.trim() || createSel.isPending }}
                    style={[styles.inlineBtn, (!selCat.trim() || !selLabel.trim() || !selValue.trim()) && styles.disabled]}
                    onPress={() => createSel.mutate()}
                    disabled={!selCat.trim() || !selLabel.trim() || !selValue.trim() || createSel.isPending}
                  >
                    {createSel.isPending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.inlineBtnText}>Add choice</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Documents</Text>
              {project.documents.length === 0 ? (
                <Text style={styles.empty}>No documents have been attached to this planning record.</Text>
              ) : (
                project.documents.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.docRow}
                    accessibilityRole="link"
                    accessibilityLabel={`Open project document ${d.label}`}
                    onPress={() => Linking.openURL(d.fileUrl)}
                  >
                    <Text style={styles.docLabel}>{d.label}</Text>
                    <Text style={styles.docType}>{d.docType}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>

          <View style={styles.secondaryColumn}>
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Milestones</Text>
                {isOwner && (
                  <TouchableOpacity
                    style={styles.addAction}
                    accessibilityRole="button"
                    accessibilityLabel={`${showAddMs ? 'Hide' : 'Show'} add milestone form`}
                    accessibilityState={{ expanded: showAddMs }}
                    onPress={() => setShowAddMs((v) => !v)}
                  ><Text style={styles.addLink}>+ Add</Text></TouchableOpacity>
                )}
              </View>
              {project.milestones.length === 0 ? (
                <Text style={styles.empty}>No milestones yet.</Text>
              ) : (
                project.milestones.map((m) => (
                  <View key={m.id} style={styles.msRow}>
                    <View style={[styles.msDot, { backgroundColor: MS_COLOR[m.status] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.msTitle}>{m.title}</Text>
                      <Text style={styles.msMeta}>
                        {MS_LABEL[m.status]}
                        {m.amount != null ? ` · ${formatPHP(m.amount)}` : ''}
                        {m.targetDate ? ` · by ${m.targetDate}` : ''}
                      </Text>
                    </View>
                    {isOwner && m.status !== 'completed' ? (
                      <TouchableOpacity
                        style={styles.msAction}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.status === 'pending' ? 'Start' : 'Complete'} ${m.title}`}
                        onPress={() => advanceMs.mutate(m)}
                        disabled={advanceMs.isPending}
                      >
                        <Text style={styles.msActionText}>{m.status === 'pending' ? 'Start' : 'Complete'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.msStatus, { color: MS_COLOR[m.status] }]}>{MS_LABEL[m.status]}</Text>
                    )}
                  </View>
                ))
              )}
              {showAddMs && (
                <View style={styles.inlineForm}>
                  <TextInput accessibilityLabel="Milestone title" style={styles.inlineInput} value={msTitle} onChangeText={setMsTitle} placeholder="Milestone (e.g. Foundation)" placeholderTextColor={colors.textTertiary} maxLength={160} />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Add project milestone"
                    accessibilityState={{ disabled: !msTitle.trim() || createMs.isPending }}
                    style={[styles.inlineBtn, !msTitle.trim() && styles.disabled]}
                    onPress={() => createMs.mutate()}
                    disabled={!msTitle.trim() || createMs.isPending}
                  >
                    {createMs.isPending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.inlineBtnText}>Add</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.footer}>To hire a provider or move money, use the separate booking and quote flow.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  backBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  bodyScroll: { flex: 1 },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md },
  bodyWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  workspace: { gap: spacing.md },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  primaryColumn: { flex: 3, gap: spacing.md, minWidth: 0 },
  secondaryColumn: { flex: 2, gap: spacing.md, minWidth: 0 },
  planNotice: { backgroundColor: colors.infoLight, borderWidth: 1, borderColor: colors.info, borderRadius: borderRadius.lg, padding: spacing.base },
  planNoticeTitle: { ...typography.body, color: colors.infoDark, fontWeight: '700', textTransform: 'capitalize' },
  planNoticeText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20, marginTop: spacing.xs },
  description: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  addLink: { ...typography.bodySmall, fontWeight: '700', color: colors.info },
  addAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  empty: { ...typography.bodySmall, color: colors.textTertiary },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  progressPct: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.success, borderRadius: 4 },
  msRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  msDot: { width: 12, height: 12, borderRadius: 6 },
  msTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  msMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  msStatus: { fontSize: 12, fontWeight: '600' },
  msAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  msActionText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  selRow: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  selLabel: { ...typography.caption, color: colors.textSecondary },
  selValue: { ...typography.body, color: colors.text, fontWeight: '600', marginTop: 1 },
  docRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  docLabel: { ...typography.body, color: colors.info, fontWeight: '600', flex: 1 },
  docType: { ...typography.caption, color: colors.textTertiary },
  inlineForm: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  selForm: { gap: spacing.sm, marginTop: spacing.sm },
  inlineInput: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  inlineBtn: { minHeight: 44, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.base, justifyContent: 'center', alignItems: 'center' },
  inlineBtnText: { ...typography.bodySmall, fontWeight: '700', color: colors.white },
  disabled: { opacity: 0.5 },
  footer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
});
