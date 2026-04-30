import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyCertifications,
  addCertification,
  updateCertification,
  removeCertification,
  type Certification,
} from '@/services/provider-api.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle } from '@/components/icons';
// Phase 14 R5-complete — NbiStatusBanner mounts at the top of the
// certifications page so the provider sees expiry warnings on the
// same screen where they manage cert documents.
import NbiStatusBanner from '@/components/provider/NbiStatusBanner';

type ModalMode = 'add' | 'edit' | null;

export default function CertificationsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Certification | null>(null);
  const [name, setName] = useState('');
  const [issuingBody, setIssuingBody] = useState('TESDA');
  const [certNumber, setCertNumber] = useState('');
  const [certUrl, setCertUrl] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const { data: certifications = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-certifications'],
    queryFn: getMyCertifications,
  });

  const invalidate = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['my-certifications'] });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: (data: {
      name: string; issuingBody?: string; certificateNumber?: string;
      certificateUrl?: string; issuedDate?: string; expiryDate?: string;
    }) => addCertification(data),
    onSuccess: () => {
      invalidate();
      resetForm();
      Alert.alert('Success', 'Certification added. It will be reviewed for verification.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      certId: string; name?: string; issuingBody?: string; certificateNumber?: string;
      certificateUrl?: string; issuedDate?: string; expiryDate?: string;
    }) => {
      const { certId, ...rest } = data;
      return updateCertification(certId, rest);
    },
    onSuccess: () => {
      invalidate();
      resetForm();
      Alert.alert('Updated', 'Certification updated.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (certId: string) => removeCertification(certId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Removed', 'Certification removed.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const resetForm = useCallback((): void => {
    setMode(null);
    setEditTarget(null);
    setName('');
    setIssuingBody('TESDA');
    setCertNumber('');
    setCertUrl('');
    setIssuedDate('');
    setExpiryDate('');
  }, []);

  const handleAdd = useCallback((): void => {
    resetForm();
    setMode('add');
  }, [resetForm]);

  const handleEdit = useCallback((cert: Certification): void => {
    setMode('edit');
    setEditTarget(cert);
    setName(cert.name);
    setIssuingBody(cert.issuingBody);
    setCertNumber(cert.certificateNumber ?? '');
    setCertUrl(cert.certificateUrl ?? '');
    setIssuedDate(cert.issuedDate ?? '');
    setExpiryDate(cert.expiryDate ?? '');
  }, []);

  const handleSubmit = useCallback((): void => {
    if (!name.trim()) {
      Alert.alert('Required', 'Certification name is required.');
      return;
    }
    const payload = {
      name: name.trim(),
      issuingBody: issuingBody.trim() || undefined,
      certificateNumber: certNumber.trim() || undefined,
      certificateUrl: certUrl.trim() || undefined,
      issuedDate: issuedDate.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
    };
    if (mode === 'add') {
      addMutation.mutate(payload);
    } else if (mode === 'edit' && editTarget) {
      updateMutation.mutate({ certId: editTarget.id, ...payload });
    }
  }, [mode, editTarget, name, issuingBody, certNumber, certUrl, issuedDate, expiryDate, addMutation, updateMutation]);

  const handleRemove = useCallback((cert: Certification): void => {
    Alert.alert('Remove Certification', `Remove "${cert.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: (): void => { removeMutation.mutate(cert.id); } },
    ]);
  }, [removeMutation]);

  const isPending = addMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <View style={{ marginBottom: 12, alignItems: 'center' as const }}><AlertTriangle size={48} color={colors.error} /></View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load certifications. Please try again.</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Phase 14 R5-complete — NbiStatusBanner (auto-hides when valid) */}
      <NbiStatusBanner />
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Certifications</Text>
        <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {mode && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{mode === 'add' ? 'Add Certification' : 'Edit Certification'}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Certification Name *"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={styles.input}
            value={issuingBody}
            onChangeText={setIssuingBody}
            placeholder="Issuing Body (e.g. TESDA)"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={styles.input}
            value={certNumber}
            onChangeText={setCertNumber}
            placeholder="Certificate Number"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={styles.input}
            value={certUrl}
            onChangeText={setCertUrl}
            placeholder="Certificate Image URL"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.input, styles.dateInput]}
              value={issuedDate}
              onChangeText={setIssuedDate}
              placeholder="Issued Date (YYYY-MM-DD)"
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, styles.dateInput]}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="Expiry Date (YYYY-MM-DD)"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={styles.formActions}>
            <Button title="Cancel" onPress={resetForm} variant="ghost" />
            <Button
              title={isPending ? 'Saving...' : 'Save'}
              onPress={handleSubmit}
              loading={isPending}
              disabled={isPending}
            />
          </View>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.secondary} />}
      >
        {certifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📜</Text>
            <Text style={styles.emptyTitle}>No Certifications Yet</Text>
            <Text style={styles.emptyDesc}>
              Add your TESDA certifications, training certificates, or professional licenses to
              build trust and unlock Elite tier benefits.
            </Text>
            <Button title="Add Certification" onPress={handleAdd} />
          </View>
        ) : (
          certifications.map((cert) => (
            <View key={cert.id} style={styles.certCard}>
              <View style={styles.certHeader}>
                <View style={styles.certInfo}>
                  <Text style={styles.certName}>{cert.name}</Text>
                  <Text style={styles.certIssuer}>{cert.issuingBody}</Text>
                </View>
                {cert.isVerified ? (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓ Verified</Text>
                  </View>
                ) : (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingText}>Pending Review</Text>
                  </View>
                )}
              </View>
              {cert.certificateNumber && (
                <Text style={styles.certDetail}>No. {cert.certificateNumber}</Text>
              )}
              <View style={styles.certDates}>
                {cert.issuedDate && (
                  <Text style={styles.certDateText}>Issued: {cert.issuedDate}</Text>
                )}
                {cert.expiryDate && (
                  <Text style={styles.certDateText}>Expires: {cert.expiryDate}</Text>
                )}
              </View>
              <View style={styles.certActions}>
                <TouchableOpacity
                  onPress={(): void => { handleEdit(cert); }}
                  style={styles.certActionBtn}
                >
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(): void => { handleRemove(cert); }}
                  style={styles.certActionBtn}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
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
  },
  addButtonText: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },

  formCard: {
    backgroundColor: colors.backgroundSecondary,
    margin: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  formTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
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
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateInput: { flex: 1 },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, gap: spacing.sm },

  emptyState: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 64, marginBottom: spacing.base },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  certCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
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
  certDetail: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs },
  certDates: { flexDirection: 'row', gap: spacing.base, marginBottom: spacing.sm },
  certDateText: { ...typography.caption, color: colors.textTertiary },
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
});
