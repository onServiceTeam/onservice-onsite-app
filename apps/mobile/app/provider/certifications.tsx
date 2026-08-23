import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-109 fix — paste-image-URL UX replaced with real
// camera/gallery picker + multipart upload (same fix shape as the
// portfolio CRIT-108 fix). Certificate document is now picked from
// the device, uploaded via /api/v1/uploads to get an https URL, and
// only that URL is sent to /providers/me/certifications.
//
// Pre-fix: the cert form had a "Certificate Image URL" TextInput.
// Providers don't have a hosted URL for their TESDA cert — they have
// a photo of it. The screen looked wired but couldn't actually be
// completed by a real provider.
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Routes } from '@/config/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { captureImageAsync, isCameraCaptureAvailable } from '@/utils/image-capture';
import {
  getMyCertifications,
  addCertification,
  updateCertification,
  removeCertification,
  type Certification,
} from '@/services/provider-api.service';
import { uploadImages } from '@/services/upload.service';
import { getErrorMessage } from '@/utils/errors';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { Button, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Check, ScrollText } from '@/components/icons';
// Phase 14 R5-complete — NbiStatusBanner mounts at the top of the
// certifications page so the provider sees expiry warnings on the
// same screen where they manage cert documents.
import NbiStatusBanner from '@/components/provider/NbiStatusBanner';
import { useResponsive } from '@/hooks/useResponsive';

type ModalMode = 'add' | 'edit' | null;

export function normalizeCertificationDate(value: string | null | undefined): string {
  if (!value) return '';
  return /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] ?? '';
}

function isRealCertificationDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function formatCertificationDate(value: string | null | undefined): string {
  const key = normalizeCertificationDate(value);
  if (!key || !isRealCertificationDate(key)) return 'Date unavailable';
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 4)));
}

export function validateCertificationDates(issuedDate: string, expiryDate: string): string | null {
  const issued = issuedDate.trim();
  const expiry = expiryDate.trim();
  if (issued && !isRealCertificationDate(issued)) return 'Enter a real issued date in YYYY-MM-DD format.';
  if (expiry && !isRealCertificationDate(expiry)) return 'Enter a real expiry date in YYYY-MM-DD format.';
  const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  if (issued && issued > todayManila) return 'Issued date cannot be in the future.';
  if (issued && expiry && expiry < issued) return 'Expiry date must be on or after the issued date.';
  return null;
}

function CertificationDateField({
  label,
  value,
  onChange,
  minimum,
  maximum,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimum?: string;
  maximum?: string;
}): React.ReactElement {
  const webInput = Platform.OS === 'web'
    ? React.createElement('input', {
      type: 'date',
      value,
      min: minimum,
      max: maximum,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
      'aria-label': label,
      // Raw DOM inputs do not understand React Native's unit conventions.
      // In particular, RN lineHeight: 24 becomes the CSS multiplier 24 and
      // stretches the control to roughly 384 px. Use explicit CSS units.
      style: {
        boxSizing: 'border-box',
        width: '100%',
        height: 48,
        minHeight: 48,
        padding: `0 ${spacing.base}px`,
        fontSize: 16,
        fontWeight: 400,
        lineHeight: '24px',
        color: colors.text,
        backgroundColor: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
      },
    })
    : (
      <TextInput
        style={[styles.input, styles.dateInput]}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
        maxLength={10}
      />
    );

  return (
    <View style={styles.dateField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {webInput}
    </View>
  );
}

export default function CertificationsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width, isPhone } = useResponsive();

  const [mode, setMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Certification | null>(null);
  const [name, setName] = useState('');
  const [issuingBody, setIssuingBody] = useState('TESDA');
  const [certNumber, setCertNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  // Phase E CRIT-109 fix — local file URI from picker, before upload.
  const [pendingLocalUri, setPendingLocalUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: certifications = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-certifications'],
    queryFn: getMyCertifications,
  });

  const invalidate = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['my-certifications'] });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: (data: {
      name: string; issuingBody?: string; certificateNumber?: string | null;
      certificateUrl?: string | null; issuedDate?: string | null; expiryDate?: string | null;
    }) => addCertification(data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showToast('Certification added. It will be reviewed for verification.', 'success');
    },
    onError: (err: unknown) =>
      showToast(getErrorMessage(err, 'Could not add certification.'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      certId: string; name?: string; issuingBody?: string; certificateNumber?: string | null;
      certificateUrl?: string | null; issuedDate?: string | null; expiryDate?: string | null;
    }) => {
      const { certId, ...rest } = data;
      return updateCertification(certId, rest);
    },
    onSuccess: () => {
      invalidate();
      resetForm();
      showToast('Certification updated.', 'success');
    },
    onError: (err: unknown) =>
      showToast(getErrorMessage(err, 'Could not update certification.'), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (certId: string) => removeCertification(certId),
    onSuccess: () => {
      invalidate();
      showToast('Certification removed.', 'success');
    },
    onError: (err: unknown) =>
      showToast(getErrorMessage(err, 'Could not remove certification.'), 'error'),
  });

  const resetForm = useCallback((): void => {
    setMode(null);
    setEditTarget(null);
    setName('');
    setIssuingBody('TESDA');
    setCertNumber('');
    setIssuedDate('');
    setExpiryDate('');
    setPendingLocalUri(null);
  }, []);

  // Phase E CRIT-109 fix — picker handlers (mirror portfolio CRIT-108).
  const pickFromGallery = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to select a certificate photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingLocalUri(result.assets[0].uri);
    }
  }, []);

  const pickFromCamera = useCallback(async (): Promise<void> => {
    const capture = await captureImageAsync({ quality: 0.85 });
    if (capture.status === 'denied') {
      Alert.alert('Permission Required', 'Camera access is needed to photograph the certificate.');
      return;
    }
    const { result } = capture;
    if (!result.canceled && result.assets[0]) {
      setPendingLocalUri(result.assets[0].uri);
    }
  }, []);

  const showPickerOptions = useCallback((): void => {
    if (!isCameraCaptureAvailable()) {
      // Browsers offer camera vs file in the OS file sheet — the
      // Camera/Library chooser would be two routes to the same picker.
      void pickFromGallery();
      return;
    }
    Alert.alert('Add Certificate Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => { void pickFromCamera(); } },
      { text: 'Photo Library', onPress: () => { void pickFromGallery(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromGallery]);

  const handleAdd = useCallback((): void => {
    resetForm();
    setMode('add');
  }, [resetForm]);

  const handleEdit = useCallback((cert: Certification): void => {
    setMode('edit');
    setEditTarget(cert);
    // A replacement selected for one credential must never carry into another
    // credential when the provider switches cards without closing the form.
    setPendingLocalUri(null);
    setName(cert.name);
    setIssuingBody(cert.issuingBody);
    setCertNumber(cert.certificateNumber ?? '');
    setIssuedDate(normalizeCertificationDate(cert.issuedDate));
    setExpiryDate(normalizeCertificationDate(cert.expiryDate));
  }, []);

  const handleSubmit = useCallback((): void => {
    if (!name.trim()) {
      Alert.alert('Required', 'Certification name is required.');
      return;
    }
    const issued = issuedDate.trim();
    const expiry = expiryDate.trim();
    const dateError = validateCertificationDates(issued, expiry);
    if (dateError) {
      Alert.alert('Check certification dates', dateError);
      return;
    }
    // Phase E CRIT-109 fix — if a new photo was picked, upload it
    // first to get an https URL; then send that URL through. If the
    // user is editing and didn't pick a new photo, omit certificateUrl so the
    // private document already stored by the API remains unchanged.
    void (async () => {
      let finalCertUrl: string | undefined;
      if (pendingLocalUri) {
        setIsUploading(true);
        try {
          const uploaded = await uploadImages([pendingLocalUri], 'onboarding');
          const url = uploaded[0]?.url;
          if (!url) throw new Error('Upload returned no URL.');
          finalCertUrl = url;
        } catch (err) {
          showToast(getErrorMessage(err, 'Could not upload certificate photo.'), 'error');
          setIsUploading(false);
          return;
        } finally {
          setIsUploading(false);
        }
      }
      const payload = {
        name: name.trim(),
        issuingBody: issuingBody.trim() || undefined,
        certificateNumber: certNumber.trim() || null,
        issuedDate: issued || null,
        expiryDate: expiry || null,
        ...(finalCertUrl ? { certificateUrl: finalCertUrl } : {}),
      };
      if (mode === 'add') {
        addMutation.mutate(payload);
      } else if (mode === 'edit' && editTarget) {
        updateMutation.mutate({ certId: editTarget.id, ...payload });
      }
    })();
  }, [mode, editTarget, name, issuingBody, certNumber, issuedDate, expiryDate, pendingLocalUri, addMutation, updateMutation]);

  const handleRemove = useCallback((cert: Certification): void => {
    Alert.alert('Remove Certification', `Remove "${cert.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: (): void => { removeMutation.mutate(cert.id); } },
    ]);
  }, [removeMutation]);

  const isPending = addMutation.isPending || updateMutation.isPending || isUploading;
  const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load your certifications. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Phase 14 R5-complete — NbiStatusBanner (auto-hides when valid) */}
      <NbiStatusBanner onTap={() => router.push(Routes.PROVIDER.ACCOUNT_MANAGEMENT)} />
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Certifications</Text>
        <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.secondary} />}
      >
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Build trust with verified credentials</Text>
          <Text style={styles.introText}>Add TESDA certificates, professional licenses, and training credentials. Only current credentials verified by onService appear to customers. Editing a verified credential returns it for review.</Text>
        </View>
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={!isPhone ? 'Tablet and desktop certification management workspace' : undefined}
        >
          {mode && (
            <View style={styles.formColumn}>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>{mode === 'add' ? 'Add Certification' : 'Edit Certification'}</Text>
                <Text style={styles.fieldLabel}>Certification name</Text>
                    {/* BUG-PHASE197-02 — keep client limits aligned with the API. */}
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g. Electrical Installation NC II"
                      placeholderTextColor={colors.textTertiary}
                      accessibilityLabel="Certification name"
                      maxLength={200}
                    />
                <Text style={styles.fieldLabel}>Issuing body</Text>
                <TextInput
                  style={styles.input}
                  value={issuingBody}
                  onChangeText={setIssuingBody}
                  placeholder="e.g. TESDA or PRC"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Certification issuing body"
                  maxLength={200}
                />
                <Text style={styles.fieldLabel}>Certificate number</Text>
                <TextInput
                  style={styles.input}
                  value={certNumber}
                  onChangeText={setCertNumber}
                  placeholder="Enter the number exactly as shown"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Certification number"
                  maxLength={100}
                />
                <Text style={styles.fieldLabel}>Certificate photo</Text>
                {pendingLocalUri ? (
                  <View style={styles.previewWrap}>
                    <Image source={{ uri: pendingLocalUri }} style={styles.previewImg} resizeMode="cover" />
                    <TouchableOpacity onPress={showPickerOptions} style={styles.changeBtn} disabled={isPending}>
                      <Text style={styles.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : editTarget?.hasDocument ? (
                  <TouchableOpacity onPress={showPickerOptions} style={styles.documentOnFile} disabled={isPending}>
                    <Check size={20} color={colors.success} />
                    <View style={styles.documentOnFileCopy}>
                      <Text style={styles.pickerTitle}>Certificate photo on file</Text>
                      <Text style={styles.pickerHint}>Choose a new photo to replace it</Text>
                    </View>
                    <Text style={styles.replaceText}>Replace</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={showPickerOptions} style={styles.pickerCard} activeOpacity={0.8} disabled={isPending}>
                    <ScrollText size={36} color={colors.textTertiary} style={styles.pickerIcon} />
                    <Text style={styles.pickerTitle}>Add certificate photo</Text>
                    <Text style={styles.pickerHint}>Required before onService can verify this credential</Text>
                  </TouchableOpacity>
                )}
                <View
                  style={[styles.dateRow, width < 900 && styles.dateRowPhone]}
                  accessibilityLabel={width < 900 ? 'Stacked certification date fields' : 'Side-by-side certification date fields'}
                >
                  <CertificationDateField label="Issued date" value={issuedDate} onChange={setIssuedDate} maximum={todayManila} />
                  <CertificationDateField label="Expiry date" value={expiryDate} onChange={setExpiryDate} minimum={issuedDate || undefined} />
                </View>
                <View style={styles.formActions}>
                  <Button title="Cancel" onPress={resetForm} variant="ghost" />
                  <Button title={isUploading ? 'Uploading...' : isPending ? 'Saving...' : 'Save certification'} onPress={handleSubmit} loading={isPending} disabled={isPending} />
                </View>
              </View>
            </View>
          )}

          <View style={styles.listColumn}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your certifications ({certifications.length})</Text>
              {!mode && <Text style={styles.sectionHint}>Pull to refresh review status</Text>}
            </View>
            {certifications.length === 0 ? (
              <EmptyState
                icon={<ScrollText size={48} color={colors.textTertiary} />}
                title="No Certifications Yet"
                description="Add a certification or license, then include a clear photo so the onService team can review it."
                actionLabel="Add Certification"
                onAction={handleAdd}
              />
            ) : (
              <View style={[styles.certGrid, !isPhone && styles.certGridWide]}>
                {certifications.map((cert) => {
                  const expired = Boolean(cert.expiryDate && cert.expiryDate < todayManila);
                  return (
                    <View key={cert.id} style={[styles.certCard, !isPhone && styles.certCardWide]}>
                      <View style={styles.certHeader}>
                        <View style={styles.certInfo}>
                          <Text style={styles.certName}>{cert.name}</Text>
                          <Text style={styles.certIssuer}>{cert.issuingBody}</Text>
                        </View>
                        {expired ? (
                          <View style={styles.expiredBadge}><Text style={styles.expiredText}>Expired</Text></View>
                        ) : cert.isVerified ? (
                          <View style={styles.verifiedBadge}><Check size={13} color={colors.success} /><Text style={styles.verifiedText}>Verified</Text></View>
                        ) : (
                          <View style={styles.pendingBadge}><Text style={styles.pendingText}>Pending Review</Text></View>
                        )}
                      </View>
                      {cert.certificateNumber && <Text style={styles.certDetail}>No. {cert.certificateNumber}</Text>}
                      <View style={styles.certDates}>
                        {cert.issuedDate && <Text style={styles.certDateText}>Issued: {formatCertificationDate(cert.issuedDate)}</Text>}
                        {cert.expiryDate && <Text style={styles.certDateText}>Expires: {formatCertificationDate(cert.expiryDate)}</Text>}
                      </View>
                      <Text style={cert.hasDocument ? styles.documentReady : styles.documentMissing}>
                        {cert.hasDocument ? 'Certificate photo attached' : 'Add a photo before verification'}
                      </Text>
                      <View style={styles.certActions}>
                        <TouchableOpacity onPress={(): void => { handleEdit(cert); }} style={styles.certActionBtn} accessibilityLabel={`Edit ${cert.name}`}>
                          <Text style={styles.editText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={(): void => { handleRemove(cert); }} style={styles.certActionBtn} accessibilityLabel={`Remove ${cert.name}`}>
                          <Text style={styles.removeText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  addButtonText: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },

  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  formTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  dateRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  dateRowPhone: { flexDirection: 'column' },
  dateField: { flex: 1, width: '100%', gap: spacing.xs },
  dateInput: { width: '100%', minHeight: 48 },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 48, gap: spacing.base },
  scrollContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  introCard: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  introTitle: { ...typography.body, color: colors.primary, fontWeight: '700' },
  introText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  workspace: { width: '100%', gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  formColumn: { flex: 1, minWidth: 300 },
  listColumn: { flex: 1.35, minWidth: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  sectionTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  sectionHint: { ...typography.caption, color: colors.textTertiary },
  certGrid: { gap: spacing.sm },
  certGridWide: { flexDirection: 'row', flexWrap: 'wrap' },

  emptyState: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { marginBottom: spacing.base },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  certCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  certCardWide: { width: '48.8%', minWidth: 270 },
  certHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  certInfo: { flex: 1, marginRight: spacing.sm },
  certName: { ...typography.body, color: colors.text, fontWeight: '600' },
  certIssuer: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  verifiedText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  pendingBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  pendingText: { ...typography.caption, color: colors.warning, fontWeight: '600' },
  expiredBadge: {
    backgroundColor: colors.errorLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  expiredText: { ...typography.caption, color: colors.error, fontWeight: '600' },
  certDetail: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs },
  certDates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.base, marginBottom: spacing.sm },
  certDateText: { ...typography.caption, color: colors.textTertiary },
  documentReady: { ...typography.caption, color: colors.success, marginBottom: spacing.sm },
  documentMissing: { ...typography.caption, color: colors.warning, marginBottom: spacing.sm },
  certActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  certActionBtn: { padding: spacing.md, minHeight: 44, minWidth: 44, justifyContent: 'center' as const },
  editText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  removeText: { ...typography.bodySmall, color: colors.error, fontWeight: '600' },

  // Phase E CRIT-109 fix — picker UI styles (mirror portfolio CRIT-108).
  pickerCard: {
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed' as const,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerIcon: { marginBottom: spacing.xs },
  pickerTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  pickerHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  documentOnFile: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  documentOnFileCopy: { flex: 1 },
  replaceText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  previewWrap: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  previewImg: {
    width: '100%',
    aspectRatio: 1.5,
  },
  changeBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  changeBtnText: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },
});
