import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { submitQuote } from '@/services/booking.service';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

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

export default function QuoteBuilderScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([createEmptyItem()]);

  const addItem = (): void => setItems([...items, createEmptyItem()]);

  const updateItem = (id: number, field: keyof LineItemDraft, value: string): void => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: number): void => {
    if (items.length > 1) setItems(items.filter(item => item.id !== id));
  };

  const totalAmount = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Math.round((Number(item.unitPrice) || 0) * 100);
    return sum + Math.round(qty * price);
  }, 0);

  // BUG-PHASE48-02 fix — pre-fix the screen showed only the gross
  // quote total, not the provider's net after platform commission.
  // The provider thought they'd pocket the full quote amount and
  // got surprised at payout time when the tier-specific commission
  // was deducted. Same pattern as Phase E CRIT-101 fix on
  // provider/job/[id].tsx — fetch tier, look up commission rate,
  // render the breakdown.
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
  const commissionAmount = Math.round(totalAmount * commissionRate);
  const netEarnings = totalAmount - commissionAmount;

  const mutation = useMutation({
    mutationFn: () => {
      const lineItems = items
        .filter(i => i.description && Number(i.unitPrice) > 0)
        .map(i => ({
          description: i.description,
          quantity: Number(i.quantity) || 1,
          unit: i.unit || 'unit',
          unitPrice: Math.round((Number(i.unitPrice) || 0) * 100),
          itemType: i.itemType as 'labor' | 'materials' | 'equipment' | 'other',
        }));

      return submitQuote(bookingId ?? '', {
        quotedPrice: totalAmount,
        description,
        estimatedDays: estimatedDays ? Number(estimatedDays) : undefined,
        notes: notes || undefined,
        lineItems,
      });
    },
    onSuccess: () => {
      Alert.alert('Success', 'Your quote has been submitted. The customer will review it.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      Alert.alert('Error', getErrorMessage(err, 'Could not submit quote.'));
    },
  });

  const isValid = description.length >= 10 && totalAmount >= platformConfig.minimumQuoteAmount && items.some(i => i.description && Number(i.unitPrice) > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Build Quote</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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
            <TouchableOpacity onPress={addItem} style={styles.addItemBtn}>
              <Text style={styles.addItemText}>+ Add Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((item, idx) => (
            <View key={item.id} style={styles.lineItemCard}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemNum}>#{idx + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeItemBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.removeItem}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.input}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, 'description', v)}
                placeholder="Item description"
                placeholderTextColor={colors.textTertiary}
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
          {totalAmount > 0 && (
            <View style={styles.commissionRow}>
              <Text style={styles.commissionLabel}>
                − Platform commission ({Math.round(commissionRate * 100)}% — {providerTier} tier)
              </Text>
              <Text style={styles.commissionValue}>−{formatPHP(commissionAmount)}</Text>
            </View>
          )}
          {totalAmount > 0 && (
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Your net earnings</Text>
              <Text style={styles.netValue}>{formatPHP(netEarnings)}</Text>
            </View>
          )}
          {totalAmount > 0 && totalAmount < platformConfig.minimumQuoteAmount && (
            <Text style={styles.minWarn}>Minimum quote: {formatPHP(platformConfig.minimumQuoteAmount)}</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  textArea: { backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 80 },
  input: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, marginBottom: spacing.sm },
  addItemBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minHeight: 44, justifyContent: 'center' as const },
  addItemText: { fontSize: 13, fontWeight: '600', color: colors.info },
  lineItemCard: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
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
  submitBtn: { backgroundColor: colors.success, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
