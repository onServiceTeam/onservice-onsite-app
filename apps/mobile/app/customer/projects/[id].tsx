import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProject, updateProject, addMilestone, updateMilestone, addSelection,
  PROJECT_ADVISORY_BUDGET_MAX_PESOS,
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
import { Routes } from '@/config/navigation';

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
  const [showEditProject, setShowEditProject] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editEstimate, setEditEstimate] = useState('');

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['project', id] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  };
  const editEstimateValue = Number(editEstimate);
  const editEstimateValid = editEstimate.trim() === '' || (
    Number.isFinite(editEstimateValue)
    && editEstimateValue >= 0
    && editEstimateValue <= PROJECT_ADVISORY_BUDGET_MAX_PESOS
  );
  const editProjectValid = editTitle.trim().length > 0 && editEstimateValid;

  const saveProject = useMutation({
    mutationFn: () => updateProject(id ?? '', {
      title: editTitle.trim(),
      description: editDescription.trim(),
      address: editAddress.trim() || null,
      city: editCity.trim() || null,
      estimatedTotal: editEstimate.trim() === '' ? null : Math.round(editEstimateValue * 100),
    }),
    onSuccess: () => {
      setShowEditProject(false);
      invalidate();
      showToast('Project details saved.', 'success');
    },
    onError: (e) => showToast(getErrorMessage(e, 'Could not save the project details.'), 'error'),
  });

  const beginProjectEdit = (): void => {
    const project = q.data;
    if (!project) return;
    setEditTitle(project.title);
    setEditDescription(project.description ?? '');
    setEditAddress(project.address ?? '');
    setEditCity(project.city ?? '');
    setEditEstimate(project.estimatedTotal == null ? '' : String(project.estimatedTotal / 100));
    setShowEditProject(true);
  };

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
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Project overview</Text>
                {isOwner && !showEditProject ? (
                  <TouchableOpacity
                    style={styles.editAction}
                    accessibilityRole="button"
                    accessibilityLabel="Edit project details"
                    onPress={beginProjectEdit}
                  >
                    <Text style={styles.editActionText}>Edit details</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {showEditProject ? (
                <View style={styles.editForm} accessibilityLabel="Edit project planning details">
                  <View>
                    <Text style={styles.fieldLabel}>Project title *</Text>
                    <TextInput
                      accessibilityLabel="Edit project title"
                      style={styles.editInput}
                      value={editTitle}
                      onChangeText={setEditTitle}
                      maxLength={160}
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>Description</Text>
                    <TextInput
                      accessibilityLabel="Edit project description"
                      style={[styles.editInput, styles.editTextArea]}
                      value={editDescription}
                      onChangeText={setEditDescription}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={4000}
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>Project address</Text>
                    <TextInput
                      accessibilityLabel="Edit project address"
                      style={styles.editInput}
                      value={editAddress}
                      onChangeText={setEditAddress}
                      placeholder="Street, building, subdivision, or site reference"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={500}
                    />
                    <Text style={styles.fieldHint}>Planning context only. A booking confirms its own service address.</Text>
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>City</Text>
                    <TextInput
                      accessibilityLabel="Edit project city"
                      style={styles.editInput}
                      value={editCity}
                      onChangeText={setEditCity}
                      maxLength={100}
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>Advisory budget</Text>
                    <View style={styles.budgetRow}>
                      <Text style={styles.budgetPrefix}>₱</Text>
                      <TextInput
                        accessibilityLabel="Edit advisory project budget"
                        style={styles.budgetInput}
                        value={editEstimate}
                        onChangeText={setEditEstimate}
                        keyboardType="numeric"
                        placeholder="0.00"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <Text style={styles.fieldHint}>This is not a quote, charge, escrow amount, or approved price.</Text>
                    {!editEstimateValid ? <Text style={styles.validationText}>Enter an amount from ₱0 to ₱20,000,000.</Text> : null}
                  </View>
                  <View style={styles.formActions}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel project detail editing"
                      onPress={() => setShowEditProject(false)}
                      disabled={saveProject.isPending}
                    >
                      <Text style={styles.secondaryBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, !editProjectValid && styles.disabled]}
                      accessibilityRole="button"
                      accessibilityLabel="Save project details"
                      accessibilityState={{ disabled: !editProjectValid || saveProject.isPending, busy: saveProject.isPending }}
                      onPress={() => saveProject.mutate()}
                      disabled={!editProjectValid || saveProject.isPending}
                    >
                      {saveProject.isPending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.saveBtnText}>Save details</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.overviewDescription}>{project.description || 'No project description added yet.'}</Text>
                  <View style={styles.overviewGrid}>
                    <View style={styles.overviewItem}>
                      <Text style={styles.overviewLabel}>Planning location</Text>
                      <Text style={styles.overviewValue}>
                        {[project.address, project.city].filter(Boolean).join(', ') || 'No planning location added'}
                      </Text>
                    </View>
                    <View style={styles.overviewItem}>
                      <Text style={styles.overviewLabel}>Advisory budget</Text>
                      <Text style={styles.overviewValue}>
                        {project.estimatedTotal == null ? 'No planning budget added' : formatPHP(project.estimatedTotal)}
                      </Text>
                      <Text style={styles.fieldHint}>Not a quote, charge, escrow amount, or approved price.</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

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

        {isOwner ? (
          <TouchableOpacity
            style={styles.supportAction}
            accessibilityRole="button"
            accessibilityLabel={`Get support for project ${project.title}`}
            onPress={() => router.push({
              pathname: Routes.SUPPORT.NEW,
              params: {
                projectId: project.id,
                projectTitle: project.title,
                type: 'general_inquiry',
                subject: `Help with ${project.title}`,
              },
            })}
          >
            <Text style={styles.supportActionTitle}>Get help with this project</Text>
            <Text style={styles.supportActionText}>Send the planning record to support without turning it into a booking or payment case.</Text>
          </TouchableOpacity>
        ) : null}

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
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  addLink: { ...typography.bodySmall, fontWeight: '700', color: colors.info },
  addAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  editAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  editActionText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  editForm: { gap: spacing.md },
  fieldLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '600', marginBottom: spacing.xs },
  editInput: { minHeight: 48, backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  editTextArea: { minHeight: 100 },
  budgetRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.md },
  budgetPrefix: { fontSize: 16, color: colors.textSecondary, marginRight: spacing.xs },
  budgetInput: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: 15, color: colors.text },
  fieldHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs, lineHeight: 18 },
  validationText: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  secondaryBtn: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.base },
  secondaryBtnText: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  saveBtn: { minHeight: 44, minWidth: 120, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.base },
  saveBtnText: { ...typography.bodySmall, color: colors.white, fontWeight: '700' },
  overviewDescription: { ...typography.body, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.md },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  overviewItem: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  overviewLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', textTransform: 'uppercase' },
  overviewValue: { ...typography.body, color: colors.text, fontWeight: '600', marginTop: spacing.xs, lineHeight: 20 },
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
  supportAction: { minHeight: 64, backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md, justifyContent: 'center' },
  supportActionTitle: { ...typography.body, color: colors.white, fontWeight: '700' },
  supportActionText: { ...typography.caption, color: colors.white, marginTop: 2, lineHeight: 18 },
  footer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
});
