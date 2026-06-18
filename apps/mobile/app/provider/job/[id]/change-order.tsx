import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createChangeOrder, getBookingById } from '@/services/booking.service';
import { useImagePicker } from '@/hooks/useImagePicker';
import { showToast } from '@/lib/toast';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Info } from '@/components/icons';
import { platformConfig } from '@/config/platform.config';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';

export default function ChangeOrderFormScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const imagePicker = useImagePicker({ context: 'change-order', maxImages: 10 });

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedUrls = await imagePicker.uploadAll();
      return createChangeOrder(bookingId ?? '', {
        description,
        additionalAmount: Math.round((Number(amount) || 0) * 100),
        photos: uploadedUrls.length > 0 ? uploadedUrls : undefined,
      });
    },
    onSuccess: () => {
      // A7 — non-blocking toast then return to the job; was a modal Alert.
      showToast('Change order submitted. Waiting for customer approval.', 'success');
      router.back();
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper (A7: non-blocking toast).
      showToast(getErrorMessage(err, 'Could not submit change order.'), 'error');
    },
  });

  // BUG-PHASE91-01 fix — pre-fix the form had no client-side knowledge
  // of the 50% relative cap that booking.service.createChangeOrder
  // enforces (Phase 14 D05 Bug 1219). A provider entering 60% of the
  // original service price would pass the disabled-button gate, hit
  // Submit, and get a 400 with the friendly Zod-shaped error from the
  // server — but only AFTER waiting through the photo upload. The
  // bottom note also misrepresented the rule: there is no admin
  // override path; the API rejects amounts >50% outright. Now the
  // form fetches the booking, shows the cap, blocks the button, and
  // the note text matches server behavior.
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
    staleTime: 60 * 1000,
  });
  const servicePrice = bookingQuery.data?.servicePrice ?? 0;
  const fiftyPercentCap = Math.floor(servicePrice * 0.5);

  const amountCentavos = Math.round((Number(amount) || 0) * 100);
  const exceedsCap = fiftyPercentCap > 0 && amountCentavos > fiftyPercentCap;
  const isValid =
    description.length >= 10
    && amountCentavos >= platformConfig.minimumChangeOrderAmount
    && !exceedsCap;

  // BUG-PHASE59-01 fix — pre-fix the screen showed only the gross
  // additional amount with no preview of the provider's net after
  // platform commission. Same gap pattern fixed for QuoteBuilder
  // in Phase 48 (BUG-PHASE48-02). Provider thought they'd pocket
  // the full additional charge and got surprised at payout time.
  const providerMeQuery = useQuery<{ tier: string }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier };
    },
    staleTime: 5 * 60 * 1000,
  });
  const providerTier = providerMeQuery.data?.tier ?? 'new';
  const commissionRate =
    platformConfig.commissionRates[providerTier]
    ?? platformConfig.commissionRates.new
    ?? 0.15;
  const commissionAmount = Math.round(amountCentavos * commissionRate);
  const netEarnings = amountCentavos - commissionAmount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Change Order</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.infoBox}>
          <View style={styles.infoIconWrap}><Info size={20} color={colors.primary} /></View>
          <Text style={styles.infoText}>
            Change orders request additional payment for work beyond the original scope. The customer must approve before you proceed.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Work Description *</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the additional work needed and why it wasn't in the original scope..."
            placeholderTextColor={colors.textTertiary}
            maxLength={2000}
          />
          <Text style={[styles.charCount, description.length < 10 ? styles.charRed : styles.charGreen]}>
            {description.length}/10 min
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Amount *</Text>
          <View style={styles.amountField}>
            <Text style={styles.prefix}>{platformConfig.currencySymbol}</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          {amountCentavos > 0 && amountCentavos < platformConfig.minimumChangeOrderAmount && (
            <Text style={styles.minWarn}>
              Minimum amount: {formatPHP(platformConfig.minimumChangeOrderAmount)}
            </Text>
          )}
          {/* BUG-PHASE91-01 — show the 50% cap inline so the provider
               sees the limit before they tap Submit. */}
          {fiftyPercentCap > 0 && (
            <Text style={[styles.minWarn, exceedsCap && { color: colors.error, fontWeight: '600' as const }]}>
              {exceedsCap
                ? `Exceeds maximum of ${formatPHP(fiftyPercentCap)} (50% of original service price ${formatPHP(servicePrice)}).`
                : `Maximum: ${formatPHP(fiftyPercentCap)} (50% of original ${formatPHP(servicePrice)}).`}
            </Text>
          )}
          {/* BUG-PHASE59-01 — commission preview. */}
          {amountCentavos > 0 && (
            <View style={styles.commissionBox}>
              <View style={styles.commissionRow}>
                <Text style={styles.commissionLabel}>
                  − Platform commission ({Math.round(commissionRate * 100)}% — {providerTier} tier)
                </Text>
                <Text style={styles.commissionValue}>−{formatPHP(commissionAmount)}</Text>
              </View>
              <View style={[styles.commissionRow, styles.netRow]}>
                <Text style={styles.netLabel}>Your net earnings</Text>
                <Text style={styles.netValue}>{formatPHP(netEarnings)}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos (optional)</Text>
          <Text style={styles.hint}>Add photos showing why additional work is needed</Text>
          <View style={styles.photoGrid}>
            {imagePicker.localUris.map((uri, i) => (
              <View key={uri} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.photoImage} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => imagePicker.removeImage(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {imagePicker.localUris.length < 10 && (
              <TouchableOpacity
                style={styles.addPhotoBtn}
                onPress={imagePicker.showPickerOptions}
              >
                <Text style={styles.addPhotoPlus}>+</Text>
                <Text style={styles.addPhotoLabel}>Add Photos</Text>
              </TouchableOpacity>
            )}
          </View>
          {imagePicker.isUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.info} />
              <Text style={styles.uploadingText}>Uploading photos...</Text>
            </View>
          )}
        </View>

        {/* BUG-PHASE91-01 — pre-fix this note said "exceeding 50% may
             require admin approval." There is no admin-approval path —
             booking.service.createChangeOrder rejects amounts >50% with
             HTTP 400. Updated to reflect actual server behavior. */}
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Note: Change orders are capped at 50% of the original service price. Larger amounts must be discussed and rebooked separately.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>Submit Change Order</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  infoBox: { flexDirection: 'row', gap: spacing.sm + 2, backgroundColor: colors.primaryLight, borderRadius: borderRadius.lg, padding: spacing.md + 2, marginBottom: spacing.lg - 4, borderWidth: 1, borderColor: colors.primary },
  infoIcon: { fontSize: 18 },
  infoIconWrap: { alignItems: 'center' as const, marginRight: 8 },
  infoText: { flex: 1, ...typography.caption, color: colors.primary, lineHeight: 18 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  textArea: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md + 2, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 100 },
  charCount: { fontSize: 12, marginTop: spacing.xs, textAlign: 'right' },
  charRed: { color: colors.error },
  charGreen: { color: colors.success },
  amountField: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md + 2 },
  prefix: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginRight: spacing.xs + 2 },
  amountInput: { flex: 1, paddingVertical: spacing.md + 2, fontSize: 24, fontWeight: '700', color: colors.text },
  minWarn: { fontSize: 12, color: colors.error, marginTop: spacing.xs },
  commissionBox: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, marginTop: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  commissionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commissionLabel: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  commissionValue: { fontSize: 13, color: colors.warning, fontWeight: '600' },
  netRow: { paddingTop: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  netLabel: { fontSize: 13, color: colors.text, fontWeight: '700' },
  netValue: { fontSize: 16, color: colors.success, fontWeight: '800' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  photoThumb: { width: 80, height: 80, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%', borderRadius: borderRadius.md - 1 },
  removeBtn: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.white, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  addPhotoBtn: { width: 80, height: 80, borderRadius: borderRadius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  addPhotoPlus: { fontSize: 24, color: colors.textTertiary },
  addPhotoLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  uploadingText: { ...typography.caption, color: colors.info },
  noteBox: { backgroundColor: colors.warningLight, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg - 4, borderWidth: 1, borderColor: colors.warning },
  noteText: { fontSize: 12, color: colors.warning, lineHeight: 17 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { ...typography.body, fontWeight: '700', color: colors.white },
});
