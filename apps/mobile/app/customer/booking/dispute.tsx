import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fileDispute, getBookingById, type DisputeEvidence } from '@/services/booking.service';
import { getErrorMessage } from '@/utils/errors';
import { useImagePicker } from '@/hooks/useImagePicker';
import { colors, spacing, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Ban, Wrench, ThumbsDown, AlertOctagon, Lock, Coins, CircleHelp, AlertTriangle, ChevronLeft, Check } from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { platformConfig } from '@/config/platform.config';
import { buildRoute, Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { ErrorState, SkeletonCard } from '@/components/ui';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const DISPUTE_TYPES: ReadonlyArray<{ value: string; label: string; desc: string; icon: IconComponent }> = [
  { value: 'no_show', label: 'No Show', desc: 'Provider did not arrive', icon: Ban },
  { value: 'incomplete', label: 'Incomplete Work', desc: 'Job was left unfinished', icon: Wrench },
  { value: 'substandard', label: 'Substandard Quality', desc: 'Work quality is unsatisfactory', icon: ThumbsDown },
  { value: 'damage', label: 'Property Damage', desc: 'My property was damaged', icon: AlertOctagon },
  { value: 'theft', label: 'Theft', desc: 'Items missing after service', icon: Lock },
  { value: 'overcharge', label: 'Overcharge', desc: 'Charged more than agreed', icon: Coins },
  { value: 'other', label: 'Other', desc: 'Something else happened', icon: CircleHelp },
] as const;

const EVIDENCE_REQUIRED = new Set(['damage', 'theft']);

export default function DisputeScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { isPhone } = useResponsive();

  const [disputeType, setDisputeType] = useState('');
  const [description, setDescription] = useState('');
  const imagePicker = useImagePicker({ context: 'dispute', maxImages: 10 });
  const validBookingId = typeof bookingId === 'string' ? bookingId.trim() : '';

  const bookingQuery = useQuery({
    queryKey: ['booking', validBookingId],
    queryFn: () => getBookingById(validBookingId),
    enabled: validBookingId.length > 0,
    staleTime: 30 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedUrls = await imagePicker.uploadAll();
      const evidence: DisputeEvidence[] = uploadedUrls.map((url) => ({
        url,
        type: 'photo' as const,
      }));
      return fileDispute({
        bookingId: validBookingId,
        type: disputeType,
        description,
        evidenceUrls: evidence.length > 0 ? evidence : undefined,
      });
    },
    onSuccess: (dispute) => {
      showToast(`Dispute submitted. The provider has ${platformConfig.escrowDisputeWindowHours} hours to respond.`, 'success');
      router.replace(buildRoute(Routes.CUSTOMER.DISPUTE_DETAIL, { id: dispute.id }));
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to submit dispute. Please try again or contact support.'), 'error');
    },
  });

  const needsEvidence = EVIDENCE_REQUIRED.has(disputeType);
  const hasEvidence = imagePicker.localUris.length > 0;
  const hasValidBooking = validBookingId.length > 0;
  const isEligibleStatus = bookingQuery.data
    ? ['completed_by_provider', 'confirmed'].includes(bookingQuery.data.status)
    : false;
  const isPastDeadline = bookingQuery.data?.completedAt
    ? Date.now() - new Date(bookingQuery.data.completedAt).getTime() >
      platformConfig.escrowDisputeWindowHours * 60 * 60 * 1000
    : false;
  const isValid = hasValidBooking && isEligibleStatus && !isPastDeadline && !!disputeType && description.length >= 50 && (!needsEvidence || hasEvidence);

  if (!hasValidBooking || bookingQuery.isError || (bookingQuery.data && (!isEligibleStatus || isPastDeadline))) {
    const message = !hasValidBooking
      ? 'No booking was provided. Open the dispute form from an eligible completed booking.'
      : bookingQuery.isError
        ? "We couldn't verify this booking or its dispute eligibility. Retry before submitting evidence."
        : isPastDeadline
          ? `The ${platformConfig.escrowDisputeWindowHours}-hour filing window for this booking has ended. Contact support if you still need help.`
          : 'This booking is not eligible for a dispute yet. The provider must mark the job complete first.';
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back from dispute form">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>File a Dispute</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <ErrorState
            message={message}
            onRetry={bookingQuery.isError ? () => void bookingQuery.refetch() : () => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (bookingQuery.isLoading || !bookingQuery.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back from dispute form">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>File a Dispute</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back from dispute form"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>File a Dispute</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
      >
        <View style={styles.warningBox}>
          <View style={styles.warningIconWrap}><AlertTriangle size={22} color={colors.warning} /></View>
          <Text style={styles.warningText}>
            Disputes must be filed within {platformConfig.escrowDisputeWindowHours} hours of job completion. Please provide accurate details.
          </Text>
        </View>

        <View
          style={[styles.formWorkspace, !isPhone && styles.formWorkspaceWide]}
          accessibilityLabel={isPhone ? 'Dispute form' : 'Wide dispute review form'}
        >
        <View style={[styles.formColumn, !isPhone && styles.typeColumnWide]}>
        <View style={styles.section} accessibilityLabel="Dispute reason">
          <Text style={styles.sectionTitle}>What happened?</Text>
          {DISPUTE_TYPES.map((type) => {
            const TypeIcon = type.icon;
            return (
              <TouchableOpacity
                key={type.value}
                style={[styles.typeOption, disputeType === type.value && styles.typeSelected]}
                onPress={() => setDisputeType(type.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: disputeType === type.value }}
                accessibilityLabel={`${type.label}. ${type.desc}`}
              >
                <View style={styles.typeIconWrap}><TypeIcon size={22} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, disputeType === type.value && styles.typeLabelSelected]}>
                    {type.label}
                  </Text>
                  <Text style={styles.typeDesc}>{type.desc}</Text>
                </View>
                {disputeType === type.value && <Check size={18} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
        </View>

        <View style={[styles.formColumn, !isPhone && styles.detailColumnWide]}>
        <View style={styles.section} accessibilityLabel="Dispute details">
          <Text style={styles.sectionTitle}>Describe the issue *</Text>
          <Text style={styles.hint}>Minimum 50 characters. Be specific and factual.</Text>
          <TextInput
            style={[styles.textArea, description.length > 0 && description.length < 50 && styles.inputError]}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            placeholder="Explain what happened in detail. Include relevant times, conversations, and specifics."
            placeholderTextColor={colors.textTertiary}
            maxLength={2000}
            accessibilityLabel="Dispute description"
          />
          <Text style={[styles.charCount, description.length < 50 ? styles.charRed : styles.charGreen]}>
            {description.length}/50 min
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence {needsEvidence ? '(required)' : '(optional)'}</Text>
          {needsEvidence && (
            <Text style={styles.hintWarn}>
              Photos are required for {disputeType} disputes. Please attach at least one photo as evidence.
            </Text>
          )}
          <View style={styles.photoGrid}>
            {imagePicker.localUris.map((uri, i) => (
              <View key={uri} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.photoImage} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => imagePicker.removeImage(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove evidence photo ${i + 1}`}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {imagePicker.localUris.length < 10 && (
              <TouchableOpacity
                style={[styles.photoThumb, styles.addPhoto]}
                onPress={imagePicker.showPickerOptions}
                accessibilityRole="button"
                accessibilityLabel="Add dispute evidence photo"
              >
                <Text style={styles.addPhotoPlus}>+</Text>
                <Text style={styles.addPhotoLabel}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>
          {imagePicker.isUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.error} />
              <Text style={styles.uploadingText}>Uploading evidence...</Text>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What happens next?</Text>
          <Text style={styles.infoStep}>1. Provider is notified and has {platformConfig.escrowDisputeWindowHours} hours to respond</Text>
          <Text style={styles.infoStep}>2. The provider can respond and support sees the same evidence</Text>
          <Text style={styles.infoStep}>3. If contested, our support team reviews the case</Text>
          <Text style={styles.infoStep}>4. Unresponded disputes move into support review</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Submit dispute"
          accessibilityState={{ disabled: !isValid || mutation.isPending, busy: mutation.isPending }}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>Submit Dispute</Text>
          )}
        </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  stateContent: { flex: 1, padding: spacing.base, gap: spacing.md },
  stateContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.xl },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  formWorkspace: { width: '100%' },
  formWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  formColumn: { width: '100%' },
  typeColumnWide: { width: 380 },
  detailColumnWide: { flex: 1, minWidth: 0 },
  warningBox: { flexDirection: 'row', gap: 10, backgroundColor: colors.warningLight, borderRadius: borderRadius.lg, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.warning },
  warningIcon: { fontSize: 20 },
  warningIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  warningText: { flex: 1, fontSize: 13, color: colors.warning, lineHeight: 18 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  hintWarn: { fontSize: 13, color: colors.error, marginBottom: spacing.sm },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  typeSelected: { borderColor: colors.error, backgroundColor: colors.errorLight },
  typeIcon: { fontSize: 22 },
  typeIconWrap: { marginRight: spacing.sm, width: 28, alignItems: 'center' as const },
  typeLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  typeLabelSelected: { color: colors.error },
  typeDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  checkMark: { fontSize: 18, color: colors.error, fontWeight: '700' },
  textArea: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 120 },
  inputError: { borderColor: colors.error },
  charCount: { fontSize: 12, marginTop: spacing.xs, textAlign: 'right' },
  charRed: { color: colors.error },
  charGreen: { color: colors.success },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 80, height: 80, borderRadius: borderRadius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%', borderRadius: 9 },
  removeBtn: { position: 'absolute', top: -5, right: -5, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.white, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  addPhoto: { borderStyle: 'dashed', borderColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  addPhotoPlus: { fontSize: 24, color: colors.error },
  addPhotoLabel: { fontSize: 10, color: colors.error, marginTop: 2 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  uploadingText: { fontSize: 13, color: colors.error },
  infoBox: { backgroundColor: colors.primaryLight, borderRadius: borderRadius.lg, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.primary },
  infoTitle: { fontSize: 14, fontWeight: '700', color: colors.primaryDark, marginBottom: spacing.sm },
  infoStep: { fontSize: 13, color: colors.primary, lineHeight: 20, marginBottom: 2 },
  submitBtn: { backgroundColor: colors.error, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
