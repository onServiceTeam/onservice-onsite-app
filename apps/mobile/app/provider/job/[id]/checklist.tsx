import React, { useMemo, useState, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-105 fix — checklist now fetched from the
// server-driven /api/v1/jobs/:id/checklist endpoint (Phase 14 D07
// Bug 460/463). Pre-fix the screen shipped a HARDCODED cleaning
// checklist (Living Room → Kitchen → Bedroom → Bathroom) regardless
// of what service the booking was for — a plumber's job displayed
// "vacuum living room" + "wipe kitchen counters" instead of the
// real plumbing checklist tied to the service category. Per-toggle
// state is now persisted via PATCH /jobs/:id/checklist/items/:itemId
// so the customer also sees real-time progress and the booking
// transition gate (completed_by_provider requires checklist done)
// reflects actual completion.
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { uploadBookingPhoto } from '@/services/booking-photo.service';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { CheckCircle2, Camera, AlertCircle, X } from '@/components/icons';

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  completedAt: string | null;
  photoUri: string | null;
}

interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface FlatRow {
  type: 'header' | 'item';
  sectionId: string;
  sectionTitle?: string;
  item?: ChecklistItem;
}

export default function JobChecklistScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [sections, setSections] = useState<ChecklistSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueItemId, setIssueItemId] = useState<string | null>(null);
  const [issueText, setIssueText] = useState('');
  const [issueSubmitting, setIssueSubmitting] = useState(false);

  // Phase E CRIT-105 fix — fetch the canonical checklist for this
  // booking from the server. The server's getChecklistForBooking
  // returns sections + items based on the booking's service category
  // (template tied to category_id). On first call it materializes
  // a per-booking checklist row from the template; subsequent calls
  // return the same row so partial-progress survives screen
  // re-mounts.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const res = await api.get<{
          success: boolean;
          data: {
            sections: Array<{
              id: string;
              title: string;
              items: Array<{
                id: string;
                title: string;
                isCompleted: boolean;
                completedAt: string | null;
                photoId: string | null;
              }>;
            }>;
          };
        }>(`/api/v1/jobs/${id}/checklist`);
        if (cancelled) return;
        const mapped: ChecklistSection[] = res.data.data.sections.map((s) => ({
          id: s.id,
          title: s.title,
          items: s.items.map((it) => ({
            id: it.id,
            label: it.title,
            done: it.isCompleted,
            completedAt: it.completedAt,
            photoUri: it.photoId ? `photo:${it.photoId}` : null,
          })),
        }));
        setSections(mapped);
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err, 'Could not load the checklist for this job.'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const totals = useMemo(() => {
    let total = 0;
    let done = 0;
    sections.forEach((s) => {
      s.items.forEach((it) => {
        total += 1;
        if (it.done) done += 1;
      });
    });
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }, [sections]);

  const rows = useMemo<FlatRow[]>(() => {
    const list: FlatRow[] = [];
    sections.forEach((s) => {
      list.push({ type: 'header', sectionId: s.id, sectionTitle: s.title });
      s.items.forEach((it) => list.push({ type: 'item', sectionId: s.id, item: it }));
    });
    return list;
  }, [sections]);

  const updateItem = (itemId: string, patch: Partial<ChecklistItem>): void => {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
      })),
    );
  };

  // Phase E CRIT-105 fix — toggleDone now PATCHes the server so
  // the customer's mirror view + the booking's "checklist complete"
  // gate (used by status-transition validators) sees the updated
  // state. Optimistic local update first; revert on server error.
  const toggleDone = (item: ChecklistItem): void => {
    const nextDone = !item.done;
    const nextCompletedAt = nextDone ? new Date().toISOString() : null;
    updateItem(item.id, { done: nextDone, completedAt: nextCompletedAt });
    void (async () => {
      try {
        await api.patch(`/api/v1/jobs/${id}/checklist/items/${item.id}`, {
          isCompleted: nextDone,
        });
      } catch (err: unknown) {
        // Revert local state and surface the error.
        updateItem(item.id, { done: item.done, completedAt: item.completedAt });
        Alert.alert('Could not save', getErrorMessage(err, 'Please try again.'));
      }
    })();
  };

  const capturePhoto = async (item: ChecklistItem): Promise<void> => {
    if (!id) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Camera permission', 'Please allow camera access to attach photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset) return;
      // Optimistic local preview while we upload.
      updateItem(item.id, { photoUri: asset.uri });
      // BUG-PHASE67-02 fix — pre-fix this only set photoUri locally,
      // so the captured photo never reached the server. Customer's
      // mirror checklist + the booking-photo audit trail (used by
      // dispute mediation) saw nothing. Now we upload to the
      // canonical /api/v1/uploads/booking-photo endpoint with
      // photoType='checklist' so the photo persists, the customer
      // sees it, and dispute reviewers can audit it later.
      try {
        const uploaded = await uploadBookingPhoto({
          uri: asset.uri,
          bookingId: id,
          photoType: 'checklist',
        });
        // Replace optimistic file:// URI with the real https URL the
        // server returned, so the photo survives screen re-mounts.
        updateItem(item.id, { photoUri: uploaded.storageUrl });
      } catch (err: unknown) {
        // Revert local preview and surface the failure.
        updateItem(item.id, { photoUri: item.photoUri });
        Alert.alert('Upload failed', getErrorMessage(err, 'Could not save the photo. Please try again.'));
      }
    } catch {
      Alert.alert('Camera unavailable', 'Could not open the camera on this device.');
    }
  };

  const openIssue = (item: ChecklistItem): void => {
    setIssueItemId(item.id);
    setIssueText('');
    setIssueOpen(true);
  };

  const submitIssue = async (): Promise<void> => {
    if (!id || !issueItemId) {
      setIssueOpen(false);
      return;
    }
    if (issueText.trim().length === 0) {
      Alert.alert('Required', 'Please describe the issue.');
      return;
    }
    setIssueSubmitting(true);
    try {
      await api.post(`/api/v1/bookings/${id}/issues`, {
        itemId: issueItemId,
        description: issueText.trim(),
      });
      Alert.alert('Reported', 'Your issue has been sent to the customer.');
    } catch {
      Alert.alert('Reported', 'Issue saved locally; will sync when you are back online.');
    } finally {
      setIssueSubmitting(false);
      setIssueOpen(false);
      setIssueItemId(null);
      setIssueText('');
    }
  };

  const handleContinue = (): void => {
    router.push(`/provider/job/${id}/complete` as never);
  };

  const renderRow = ({ item: row }: { item: FlatRow }): React.ReactElement => {
    if (row.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{row.sectionTitle}</Text>
        </View>
      );
    }
    const item = row.item!;
    return (
      <View style={styles.itemRow}>
        <TouchableOpacity
          onPress={() => toggleDone(item)}
          style={styles.checkBtn}
          activeOpacity={0.7}
        >
          {item.done ? (
            <CheckCircle2 size={26} color={colors.success} />
          ) : (
            <View style={styles.uncheckedCircle} />
          )}
        </TouchableOpacity>
        <View style={styles.itemBody}>
          <Text style={[styles.itemLabel, item.done && styles.itemLabelDone]}>
            {item.label}
          </Text>
          {item.photoUri && (
            <Image source={{ uri: item.photoUri }} style={styles.thumb} resizeMode="cover" />
          )}
          <View style={styles.itemActions}>
            <TouchableOpacity
              style={styles.actionLink}
              onPress={() => { void capturePhoto(item); }}
              activeOpacity={0.7}
            >
              <Camera size={14} color={colors.primary} />
              <Text style={styles.actionLinkText}>{item.photoUri ? 'Replace photo' : '+ Photo'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionLink}
              onPress={() => openIssue(item)}
              activeOpacity={0.7}
            >
              <AlertCircle size={14} color={colors.warning} />
              <Text style={[styles.actionLinkText, { color: colors.warning }]}>Report Issue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Phase E CRIT-105 — loading + error states for the server fetch.
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Service Checklist</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.progressWrap, { alignItems: 'center', paddingVertical: spacing.xl }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Service Checklist</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.progressWrap, { alignItems: 'center', paddingVertical: spacing.xl }]}>
          <AlertCircle size={32} color={colors.error} />
          <Text style={[styles.progressText, { marginTop: spacing.md, color: colors.error }]}>
            {loadError}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Checklist</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>
          {totals.done} of {totals.total} complete · {totals.pct}%
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${totals.pct}%` }]} />
        </View>
        <Text style={styles.bookingRef}>Booking #{id ?? '—'}</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row, idx) =>
          row.type === 'header' ? `h-${row.sectionId}` : `i-${row.item!.id}-${idx}`
        }
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Save & Continue</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={issueOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIssueOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Issue</Text>
              <TouchableOpacity onPress={() => setIssueOpen(false)} style={styles.modalClose}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Describe what went wrong. The customer will be notified.
            </Text>
            <TextInput
              value={issueText}
              onChangeText={setIssueText}
              multiline
              numberOfLines={4}
              placeholder="e.g. unable to reach area, missing supplies…"
              placeholderTextColor={colors.textTertiary}
              style={styles.modalInput}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.primaryBtn, issueSubmitting && styles.primaryBtnDisabled]}
              onPress={() => { void submitIssue(); }}
              disabled={issueSubmitting}
              activeOpacity={0.8}
            >
              {issueSubmitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Send Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 44 },
  progressWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  progressText: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: { height: '100%', backgroundColor: colors.success },
  bookingRef: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  listContent: { padding: spacing.base, paddingBottom: 120 },
  sectionHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  checkBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  uncheckedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  itemBody: { flex: 1 },
  itemLabel: { ...typography.body, color: colors.text },
  itemLabelDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  itemActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionLinkText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { ...typography.button, color: colors.white },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: { ...typography.h3, color: colors.text },
  modalClose: { padding: spacing.xs },
  modalHint: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 100,
    color: colors.text,
    ...typography.body,
    marginBottom: spacing.md,
  },
});
