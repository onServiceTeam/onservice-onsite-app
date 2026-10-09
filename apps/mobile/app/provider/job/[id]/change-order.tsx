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
import { useResponsive } from '@/hooks/useResponsive';
import { ErrorState } from '@/components/ui';

// D27 Phase 3 — a parts/materials/labor line the provider adds to itemize a
// change order. unitPrice is centavos; the row's total is qty × unitPrice.
interface DraftLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // centavos
  itemType: 'materials' | 'labor' | 'equipment' | 'other';
}

const ITEM_TYPES: { value: DraftLineItem['itemType']; label: string }[] = [
  { value: 'materials', label: 'Materials' },
  { value: 'labor', label: 'Labor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

export default function ChangeOrderFormScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPhone } = useResponsive();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const imagePicker = useImagePicker({ context: 'change-order', maxImages: 10 });

  // D27 Phase 3 — itemized parts/materials breakdown. When the provider adds at
  // least one line item, the additional amount is computed from the items
  // (server-canonical) and the manual amount field is replaced by the total.
  const [itemized, setItemized] = useState(false);
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [liDesc, setLiDesc] = useState('');
  const [liQty, setLiQty] = useState('1');
  const [liUnit, setLiUnit] = useState('unit');
  const [liPrice, setLiPrice] = useState('');
  const [liType, setLiType] = useState<DraftLineItem['itemType']>('materials');

  const liQtyNum = Number(liQty);
  const liPriceCentavos = Math.round(Number(liPrice) * 100);
  const canAddLineItem = liDesc.trim().length > 0
    && liDesc.trim().length <= 500
    && Number.isFinite(liQtyNum)
    && liQtyNum >= 0.01
    && liQtyNum <= 99999
    && Number.isSafeInteger(liPriceCentavos)
    && liPriceCentavos > 0
    && liUnit.trim().length > 0
    && liUnit.trim().length <= 30;

  function addLineItem(): void {
    if (!canAddLineItem) return;
    setLineItems((prev) => [
      ...prev,
      { description: liDesc.trim(), quantity: liQtyNum, unit: liUnit.trim(), unitPrice: liPriceCentavos, itemType: liType },
    ]);
    setLiDesc('');
    setLiQty('1');
    setLiUnit('unit');
    setLiPrice('');
    setLiType('materials');
  }

  function removeLineItem(index: number): void {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const itemizedTotalCentavos = lineItems.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  const useItemized = itemized && lineItems.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedUrls = await imagePicker.uploadAll();
      if (useItemized) {
        return createChangeOrder(bookingId ?? '', {
          description: description.trim(),
          lineItems: lineItems.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            itemType: i.itemType,
          })),
          photos: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        });
      }
      return createChangeOrder(bookingId ?? '', {
        description: description.trim(),
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

  // In itemized mode the amount is the computed line-item total; otherwise the
  // manually entered amount. The cap/min/commission logic below is shared.
  const manualAmountCentavos = Math.round(Number(amount) * 100);
  const amountCentavos = useItemized ? itemizedTotalCentavos : manualAmountCentavos;
  const amountValid = Number.isSafeInteger(amountCentavos) && amountCentavos > 0;
  const exceedsCap = fiftyPercentCap > 0 && amountCentavos > fiftyPercentCap;
  const isValid =
    !!bookingQuery.data
    && description.trim().length >= 10
    && amountValid
    && amountCentavos >= platformConfig.minimumChangeOrderAmount
    && !exceedsCap
    && (!itemized || lineItems.length > 0);

  // BUG-PHASE59-01 fix — pre-fix the screen showed only the gross
  // additional amount with no preview of the provider's net after
  // platform commission. Same gap pattern fixed for QuoteBuilder
  // in Phase 48 (BUG-PHASE48-02). Provider thought they'd pocket
  // the full additional charge and got surprised at payout time.
  const providerMeQuery = useQuery<{ tier: string; commissionRate: number }>({
    queryKey: ['providerCommissionPreview', bookingId],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string; commissionRate: number } }>(`/api/v1/providers/me/commission-preview?bookingId=${encodeURIComponent(bookingId!)}`);
      return { tier: res.data.data.tier, commissionRate: res.data.data.commissionRate };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!bookingId,
  });
  const providerTier = providerMeQuery.data?.tier;
  const commissionRate = providerMeQuery.data?.commissionRate;
  const commissionAmount = commissionRate == null ? null : Math.round(amountCentavos * commissionRate);
  const netEarnings = commissionAmount == null ? null : amountCentavos - commissionAmount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Change Order</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}>
        <View
          style={styles.workspace}
          accessibilityLabel={isPhone ? 'Provider change order form' : 'Tablet and desktop provider change order workspace'}
        >
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

        {/* D27 Phase 3 — itemize parts/materials. Off by default (legacy lump
            sum). When on, the provider adds line items and the additional
            amount is the computed total. */}
        <View style={styles.section}>
          <View style={styles.itemizeToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Itemize parts & materials</Text>
              <Text style={styles.hint}>Break the cost into parts, materials, and labor so the customer sees what they're paying for.</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, itemized && styles.toggleOn]}
              onPress={() => setItemized((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: itemized }}
            >
              <View style={[styles.toggleKnob, itemized && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          {itemized && (
            <View>
              {lineItems.map((li, idx) => (
                <View key={`${li.description}-${idx}`} style={styles.liRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liDesc}>{li.description}</Text>
                    <Text style={styles.liMeta}>
                      {li.quantity} {li.unit} × {formatPHP(li.unitPrice)} · {li.itemType}
                    </Text>
                  </View>
                  <Text style={styles.liTotal}>{formatPHP(Math.round(li.quantity * li.unitPrice))}</Text>
                  <TouchableOpacity
                    onPress={() => removeLineItem(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Remove ${li.description}`}
                  >
                    <Text style={styles.liRemove}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.liForm}>
                <TextInput
                  style={styles.liInput}
                  value={liDesc}
                  onChangeText={setLiDesc}
                  placeholder="Item (e.g. Replacement faucet)"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={500}
                />
                <View style={styles.liFormRow}>
                  <TextInput
                    style={[styles.liInput, styles.liInputSmall]}
                    keyboardType="numeric"
                    value={liQty}
                    onChangeText={setLiQty}
                    placeholder="Qty"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <TextInput
                    style={[styles.liInput, styles.liInputSmall]}
                    value={liUnit}
                    onChangeText={setLiUnit}
                    placeholder="unit"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={30}
                  />
                  <View style={[styles.liInput, styles.liInputSmall, styles.liPriceField]}>
                    <Text style={styles.liPrefix}>{platformConfig.currencySymbol}</Text>
                    <TextInput
                      style={styles.liPriceInput}
                      keyboardType="numeric"
                      value={liPrice}
                      onChangeText={setLiPrice}
                      placeholder="Price"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>
                <View style={styles.liTypeRow}>
                  {ITEM_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.liChip, liType === t.value && styles.liChipOn]}
                      onPress={() => setLiType(t.value)}
                    >
                      <Text style={[styles.liChipText, liType === t.value && styles.liChipTextOn]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.liAddBtn, !canAddLineItem && styles.submitDisabled]}
                  onPress={addLineItem}
                  disabled={!canAddLineItem}
                >
                  <Text style={styles.liAddText}>+ Add item</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Amount *</Text>
          {useItemized ? (
            <View style={styles.amountField}>
              <Text style={styles.prefix}>{platformConfig.currencySymbol}</Text>
              <Text style={[styles.amountInput, { paddingVertical: spacing.md + 2 }]}>
                {(itemizedTotalCentavos / 100).toFixed(2)}
              </Text>
              <Text style={styles.computedTag}>from {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}</Text>
            </View>
          ) : (
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
          )}
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
          {amountCentavos > 0 && commissionRate != null && commissionAmount != null && netEarnings != null && providerTier && (
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
          {bookingQuery.isError && (
            <ErrorState
              compact
              title="Original job price unavailable"
              message="We couldn't verify the 50% change-order limit, so submission remains disabled."
              onRetry={() => void bookingQuery.refetch()}
            />
          )}
          {amountCentavos > 0 && providerMeQuery.isLoading && (
            <View style={styles.commissionLoading} accessibilityLabel="Loading booking commission preview">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.hint}>Loading booking commission preview…</Text>
            </View>
          )}
          {amountCentavos > 0 && providerMeQuery.isError && (
            <ErrorState
              compact
              title="Commission preview unavailable"
              message="The additional customer charge is accurate, but your net earnings cannot be confirmed yet."
              onRetry={() => void providerMeQuery.refetch()}
            />
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
        </View>
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
  bodyContentWide: { padding: spacing.xl },
  workspace: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  infoBox: { flexDirection: 'row', gap: spacing.sm + 2, backgroundColor: colors.primaryLight, borderRadius: borderRadius.lg, padding: spacing.md + 2, marginBottom: spacing.lg - 4, borderWidth: 1, borderColor: colors.primary },
  infoIcon: { fontSize: 18 },
  infoIconWrap: { alignItems: 'center' as const, marginRight: 8 },
  infoText: { flex: 1, ...typography.caption, color: colors.primary, lineHeight: 18 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  commissionLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  textArea: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md + 2, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 100 },
  charCount: { fontSize: 12, marginTop: spacing.xs, textAlign: 'right' },
  charRed: { color: colors.error },
  charGreen: { color: colors.success },
  amountField: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md + 2 },
  prefix: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginRight: spacing.xs + 2 },
  amountInput: { flex: 1, paddingVertical: spacing.md + 2, fontSize: 24, fontWeight: '700', color: colors.text },
  minWarn: { fontSize: 12, color: colors.error, marginTop: spacing.xs },
  computedTag: { fontSize: 11, color: colors.textSecondary, marginLeft: spacing.sm },
  itemizeToggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.border, padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.primary },
  toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
  toggleKnobOn: { alignSelf: 'flex-end' as const },
  liRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm + 2, marginTop: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  liDesc: { fontSize: 13, fontWeight: '600', color: colors.text },
  liMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  liTotal: { fontSize: 13, fontWeight: '700', color: colors.text },
  liRemove: { fontSize: 20, color: colors.error, paddingHorizontal: 4, fontWeight: '700' },
  liForm: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.sm },
  liInput: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  liFormRow: { flexDirection: 'row', gap: spacing.sm },
  liInputSmall: { flex: 1 },
  liPriceField: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 },
  liPrefix: { fontSize: 14, color: colors.textSecondary, marginRight: 4 },
  liPriceInput: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: 14, color: colors.text },
  liTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  liChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  liChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  liChipText: { fontSize: 12, color: colors.text },
  liChipTextOn: { color: colors.primary, fontWeight: '600' },
  liAddBtn: { backgroundColor: colors.text, borderRadius: borderRadius.md, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  liAddText: { fontSize: 14, fontWeight: '700', color: colors.white },
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
