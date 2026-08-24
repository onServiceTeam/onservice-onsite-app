import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBookingById, submitQuote } from '@/services/booking.service';
import { listTemplates, type QuoteTemplate } from '@/services/provider-crm.service';
import { showToast } from '@/lib/toast';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { X } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

interface LineItemDraft {
  id: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  itemType: 'labor' | 'materials' | 'equipment' | 'other';
}

let nextItemId = 1;

function createEmptyItem(): LineItemDraft {
  return { id: nextItemId++, description: '', quantity: '1', unit: 'unit', unitPrice: '', itemType: 'labor' };
}

const URGENCY_LABELS: Record<string, string> = {
  same_day: 'Same day',
  within_3_days: 'Within 3 days',
  within_a_week: 'Within a week',
  flexible: 'Flexible',
};

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function QuoteBuilderScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPhone } = useResponsive();
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([createEmptyItem()]);
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const addItem = (): void => setItems([...items, createEmptyItem()]);

  // D27 Phase 7b — prefill line items from a saved quote template.
  const [showTemplates, setShowTemplates] = useState(false);
  const templatesQuery = useQuery({ queryKey: ['quote-templates'], queryFn: listTemplates, enabled: showTemplates, staleTime: 60 * 1000 });
  const applyTemplate = (t: QuoteTemplate): void => {
    setItems(t.items.map((it) => ({
      id: nextItemId++,
      description: it.description,
      quantity: String(it.quantity),
      unit: it.unit,
      unitPrice: String(it.unitPrice / 100),
      itemType: (['labor', 'materials', 'equipment', 'other'].includes(it.itemType) ? it.itemType : 'labor') as LineItemDraft['itemType'],
    })));
    setShowTemplates(false);
    showToast(`Loaded "${t.name}"`, 'success');
  };

  const updateItem = (id: number, field: keyof LineItemDraft, value: string): void => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: number): void => {
    if (items.length > 1) setItems(items.filter(item => item.id !== id));
  };

  // Build one canonical draft used by both the preview and submission. The old
  // path previewed quantity 0 as zero, then submitted it as quantity 1 via
  // `Number(value) || 1`, changing the total after the provider tapped Submit.
  const activeItems = items.filter((item) => item.description.trim() || item.unitPrice.trim());
  const preparedLineItems = activeItems.map((item) => ({
    description: item.description.trim(),
    quantity: Number(item.quantity),
    unit: item.unit.trim(),
    unitPrice: Math.round(Number(item.unitPrice) * 100),
    itemType: item.itemType,
  }));
  const lineItemsValid = preparedLineItems.length > 0 && preparedLineItems.every((item) =>
    item.description.length > 0
    && item.description.length <= 500
    && Number.isFinite(item.quantity)
    && item.quantity >= 0.01
    && item.quantity <= 99999
    && item.unit.length > 0
    && item.unit.length <= 30
    && Number.isSafeInteger(item.unitPrice)
    && item.unitPrice >= 1,
  );
  const totalAmount = lineItemsValid
    ? preparedLineItems.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0)
    : 0;

  // BUG-PHASE48-02 fix — pre-fix the screen showed only the gross
  // quote total, not the provider's net after platform commission.
  // The provider thought they'd pocket the full quote amount and
  // got surprised at payout time when the tier-specific commission
  // was deducted. Same pattern as Phase E CRIT-101 fix on
  // provider/job/[id].tsx — fetch tier, look up commission rate,
  // render the breakdown.
  const providerMeQuery = useQuery<{ tier: string; commissionRate: number }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string; commissionRate: number } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier, commissionRate: res.data.data.commissionRate };
    },
    staleTime: 5 * 60 * 1000,
  });
  const providerTier = providerMeQuery.data?.tier;
  const commissionRate = providerMeQuery.data?.commissionRate;
  const commissionAmount = commissionRate == null ? null : Math.round(totalAmount * commissionRate);
  const netEarnings = commissionAmount == null ? null : totalAmount - commissionAmount;

  const mutation = useMutation({
    mutationFn: () => {
      return submitQuote(bookingId ?? '', {
        quotedPrice: totalAmount,
        description: description.trim(),
        estimatedDays: estimatedDays ? Number(estimatedDays) : undefined,
        notes: notes.trim() || undefined,
        lineItems: preparedLineItems,
      });
    },
    onSuccess: () => {
      // A7 — non-blocking toast then return to the job; was a modal Alert.
      showToast('Your quote has been submitted. The customer will review it.', 'success');
      router.back();
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper (A7: non-blocking toast).
      showToast(getErrorMessage(err, 'Could not submit quote.'), 'error');
    },
  });

  const estimatedDaysNumber = estimatedDays.trim() ? Number(estimatedDays) : null;
  const estimatedDaysValid = estimatedDaysNumber == null
    || (Number.isInteger(estimatedDaysNumber) && estimatedDaysNumber >= 1 && estimatedDaysNumber <= 365);
  const isValid = !!bookingQuery.data
    && description.trim().length >= 10
    && lineItemsValid
    && totalAmount >= platformConfig.minimumQuoteAmount
    && estimatedDaysValid;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Build Quote</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Provider quote builder' : 'Wide provider quote workspace'}
        >
        <View style={[styles.contextCard, !isPhone && styles.contextColumn]}>
          <Text style={styles.contextEyebrow}>CUSTOMER REQUEST</Text>
          {bookingQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : bookingQuery.isError || !bookingQuery.data ? (
            <View>
              <Text style={styles.contextError}>The job details could not be loaded. Review the job before submitting a quote.</Text>
              <TouchableOpacity style={styles.contextRetry} onPress={() => void bookingQuery.refetch()}>
                <Text style={styles.contextRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.contextTitle}>{bookingQuery.data.serviceName ?? bookingQuery.data.categoryName ?? 'Custom service'}</Text>
              <Text style={styles.contextDescription}>{bookingQuery.data.description}</Text>
              <View style={styles.contextFacts}>
                {bookingQuery.data.urgency ? (
                  <View style={styles.contextFact}>
                    <Text style={styles.contextLabel}>Timing</Text>
                    <Text style={styles.contextValue}>{URGENCY_LABELS[bookingQuery.data.urgency] ?? bookingQuery.data.urgency}</Text>
                  </View>
                ) : null}
                {(bookingQuery.data.budgetMin != null || bookingQuery.data.budgetMax != null) ? (
                  <View style={styles.contextFact}>
                    <Text style={styles.contextLabel}>Customer budget</Text>
                    <Text style={styles.contextValue}>
                      {bookingQuery.data.budgetMin != null && bookingQuery.data.budgetMax != null
                        ? `${formatPHP(bookingQuery.data.budgetMin)} - ${formatPHP(bookingQuery.data.budgetMax)}`
                        : bookingQuery.data.budgetMin != null
                          ? `From ${formatPHP(bookingQuery.data.budgetMin)}`
                          : `Up to ${formatPHP(bookingQuery.data.budgetMax ?? 0)}`}
                    </Text>
                  </View>
                ) : null}
                {bookingQuery.data.jobPhotos.length > 0 ? (
                  <View style={styles.contextFact}>
                    <Text style={styles.contextLabel}>Evidence</Text>
                    <Text style={styles.contextValue}>{bookingQuery.data.jobPhotos.length} customer photo{bookingQuery.data.jobPhotos.length === 1 ? '' : 's'}</Text>
                  </View>
                ) : null}
              </View>
              {bookingQuery.data.intakeAnswers && Object.keys(bookingQuery.data.intakeAnswers).length > 0 ? (
                <View style={styles.intakeBlock}>
                  <Text style={styles.contextLabel}>Job details</Text>
                  {Object.entries(bookingQuery.data.intakeAnswers).map(([key, value]) => (
                    <View key={key} style={styles.intakeRow}>
                      <Text style={styles.intakeKey}>{humanizeKey(key)}</Text>
                      <Text style={styles.intakeValue}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.contextNote}>Confirm the customer’s scope and evidence before pricing. The customer will see the total and every line item.</Text>
            </>
          )}
        </View>

        <View style={styles.formColumn}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quote Description *</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what the quote covers, scope of work, approach..."
            placeholderTextColor={colors.textTertiary}
            maxLength={2000}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Line Items *</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity onPress={() => setShowTemplates((v) => !v)} style={styles.templateBtn}>
                <Text style={styles.templateBtnText}>Use template</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addItem} style={styles.addItemBtn}>
                <Text style={styles.addItemText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* D27 Phase 7b — pick a saved template to prefill the line items. */}
          {showTemplates && (
            <View style={styles.templatePanel}>
              {templatesQuery.isLoading ? (
                <ActivityIndicator size="small" color={colors.info} />
              ) : (templatesQuery.data ?? []).length === 0 ? (
                <Text style={styles.templateEmpty}>No templates yet. Create them under Profile → Quote Templates.</Text>
              ) : (
                (templatesQuery.data ?? []).map((t) => (
                  <TouchableOpacity key={t.id} style={styles.templateRow} onPress={() => applyTemplate(t)}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <Text style={styles.templateMeta}>{t.items.length} item{t.items.length !== 1 ? 's' : ''} ›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {items.map((item, idx) => (
            <View key={item.id} style={styles.lineItemCard}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemNum}>#{idx + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeItemBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>

              {/* BUG-PHASE195-01 fix — pre-fix line-item description
                  + unit had no maxLength. Server-side
                  submitQuoteSchema caps description at 500 and unit
                  at 30 (booking.validators.ts:84-87). Same UX fix-
                  shape as Phase 145/194 — input must match server. */}
              <TextInput
                style={styles.input}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, 'description', v)}
                placeholder="Item description"
                placeholderTextColor={colors.textTertiary}
                maxLength={500}
              />

              <View style={styles.typeRow}>
                {(['labor', 'materials', 'equipment', 'other'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, item.itemType === t && styles.typeChipActive]}
                    onPress={() => updateItem(item.id, 'itemType', t)}
                  >
                    <Text style={[styles.typeChipText, item.itemType === t && styles.typeChipTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.qtyPriceRow}>
                <View style={styles.fieldSmall}>
                  <Text style={styles.fieldLabel}>Qty</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="numeric"
                    value={item.quantity}
                    onChangeText={(v) => updateItem(item.id, 'quantity', v)}
                  />
                </View>
                <View style={styles.fieldSmall}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TextInput
                    style={styles.smallInput}
                    value={item.unit}
                    onChangeText={(v) => updateItem(item.id, 'unit', v)}
                    placeholder="unit"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={30}
                  />
                </View>
                <View style={styles.fieldMedium}>
                  <Text style={styles.fieldLabel}>Unit Price ({platformConfig.currencySymbol})</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="numeric"
                    value={item.unitPrice}
                    onChangeText={(v) => updateItem(item.id, 'unitPrice', v)}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              {Number(item.quantity) > 0 && Number(item.unitPrice) > 0 && (
                <Text style={styles.lineTotal}>
                  Subtotal: {formatPHP(Math.round(Number(item.quantity) * Number(item.unitPrice) * 100))}
                </Text>
              )}
            </View>
          ))}
          {activeItems.length > 0 && !lineItemsValid && (
            <Text style={styles.fieldError}>Complete or remove every started line item. Quantity must be at least 0.01.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estimated Duration</Text>
          <View style={styles.daysRow}>
            <TextInput
              style={styles.daysInput}
              keyboardType="numeric"
              value={estimatedDays}
              onChangeText={setEstimatedDays}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.daysLabel}>day(s)</Text>
          </View>
          {!estimatedDaysValid && <Text style={styles.fieldError}>Use a whole number from 1 to 365.</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            placeholder="Terms, conditions, special requirements..."
            placeholderTextColor={colors.textTertiary}
            maxLength={2000}
          />
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total Quote (customer pays)</Text>
          <Text style={styles.totalValue}>
            {formatPHP(totalAmount)}
          </Text>
          {totalAmount > 0 && commissionRate != null && commissionAmount != null && providerTier && (
            <View style={styles.commissionRow}>
              <Text style={styles.commissionLabel}>
                − Platform commission ({Math.round(commissionRate * 100)}% — {providerTier} tier)
              </Text>
              <Text style={styles.commissionValue}>−{formatPHP(commissionAmount)}</Text>
            </View>
          )}
          {totalAmount > 0 && netEarnings != null && (
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Your net earnings</Text>
              <Text style={styles.netValue}>{formatPHP(netEarnings)}</Text>
            </View>
          )}
          {totalAmount > 0 && totalAmount < platformConfig.minimumQuoteAmount && (
            <Text style={styles.minWarn}>Minimum quote: {formatPHP(platformConfig.minimumQuoteAmount)}</Text>
          )}
          {totalAmount > 0 && providerMeQuery.isError && (
            <Text style={styles.minWarn}>Commission preview unavailable. Your quote total is still shown accurately to the customer.</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>Submit Quote</Text>
          )}
        </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  workspace: { gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  contextCard: { backgroundColor: colors.infoLight, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
  contextColumn: { width: 360 },
  formColumn: { flex: 1, minWidth: 0 },
  contextEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, color: colors.primary, marginBottom: spacing.sm },
  contextTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  contextDescription: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  contextFacts: { gap: spacing.sm, marginTop: spacing.base },
  contextFact: { backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md },
  contextLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7 },
  contextValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  contextNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: spacing.base },
  contextError: { fontSize: 14, lineHeight: 20, color: colors.error },
  contextRetry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: spacing.sm },
  contextRetryText: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  intakeBlock: { marginTop: spacing.base, gap: spacing.xs },
  intakeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  intakeKey: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  intakeValue: { fontSize: 12, color: colors.text, fontWeight: '700', flex: 1, textAlign: 'right' },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  textArea: { backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 80 },
  input: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, marginBottom: spacing.sm },
  addItemBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minHeight: 44, justifyContent: 'center' as const },
  addItemText: { fontSize: 13, fontWeight: '600', color: colors.info },
  templateBtn: { backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minHeight: 44, justifyContent: 'center' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  templateBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  templatePanel: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  templateEmpty: { fontSize: 12, color: colors.textTertiary, padding: spacing.xs },
  templateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  templateName: { fontSize: 14, fontWeight: '600', color: colors.text },
  templateMeta: { fontSize: 12, color: colors.textSecondary },
  lineItemCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.md },
  lineItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  lineItemNum: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  removeItemBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  removeItem: { fontSize: 16, color: colors.error, fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  typeChip: { paddingVertical: spacing.sm, paddingHorizontal: 10, borderRadius: borderRadius.sm, backgroundColor: colors.backgroundSecondary, minHeight: 36 },
  typeChipActive: { backgroundColor: colors.text },
  typeChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  typeChipTextActive: { color: colors.white },
  qtyPriceRow: { flexDirection: 'row', gap: spacing.sm },
  fieldSmall: { flex: 1 },
  fieldMedium: { flex: 2 },
  fieldLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: spacing.xs },
  smallInput: { backgroundColor: colors.backgroundSecondary, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text },
  lineTotal: { fontSize: 13, fontWeight: '600', color: colors.success, textAlign: 'right', marginTop: spacing.sm },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  daysInput: { width: 80, backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, textAlign: 'center' },
  daysLabel: { fontSize: 14, color: colors.textSecondary },
  totalBox: { backgroundColor: colors.text, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.base },
  totalLabel: { fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  totalValue: { fontSize: 28, fontWeight: '800', color: colors.white, marginTop: spacing.xs, textAlign: 'center' },
  commissionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  commissionLabel: { fontSize: 12, color: colors.textTertiary, flex: 1 },
  commissionValue: { fontSize: 13, color: colors.warning, fontWeight: '600' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  netLabel: { fontSize: 13, color: colors.white, fontWeight: '700' },
  netValue: { fontSize: 16, color: colors.success, fontWeight: '800' },
  minWarn: { fontSize: 12, color: colors.warning, marginTop: spacing.xs, textAlign: 'center' },
  fieldError: { fontSize: 12, color: colors.error, marginTop: spacing.xs },
  submitBtn: { backgroundColor: colors.success, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
