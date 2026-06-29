import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTemplates, createTemplate, deleteTemplate, type QuoteTemplate, type TemplateItem } from '@/services/provider-crm.service';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { platformConfig } from '@/config/platform.config';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

type DraftItem = Omit<TemplateItem, 'id' | 'sortOrder'>;

function templateTotal(t: QuoteTemplate): number {
  return t.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
}

export default function QuoteTemplatesScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['quote-templates'], queryFn: listTemplates, staleTime: 60 * 1000 });
  const invalidate = (): void => { void queryClient.invalidateQueries({ queryKey: ['quote-templates'] }); };

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [liDesc, setLiDesc] = useState('');
  const [liQty, setLiQty] = useState('1');
  const [liUnit, setLiUnit] = useState('unit');
  const [liPrice, setLiPrice] = useState('');

  const canAddItem = liDesc.trim() && Number(liQty) > 0 && Number(liPrice) > 0 && liUnit.trim();
  function addItem(): void {
    if (!canAddItem) return;
    setItems((prev) => [...prev, { description: liDesc.trim(), quantity: Number(liQty), unit: liUnit.trim(), unitPrice: Math.round(Number(liPrice) * 100), itemType: 'labor' }]);
    setLiDesc(''); setLiQty('1'); setLiUnit('unit'); setLiPrice('');
  }
  function resetForm(): void { setCreating(false); setName(''); setItems([]); setLiDesc(''); setLiQty('1'); setLiUnit('unit'); setLiPrice(''); }

  const create = useMutation({
    mutationFn: () => createTemplate({ name: name.trim(), items }),
    onSuccess: () => { resetForm(); invalidate(); showToast('Template saved.', 'success'); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not save the template.'), 'error'),
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteTemplate(id), onSuccess: invalidate });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quote Templates</Text>
        {!creating ? (
          <TouchableOpacity onPress={() => setCreating(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={styles.newBtn}>+ New</Text></TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <Text style={styles.intro}>Save reusable sets of line items per service, then one-tap them into a quote so you don't start from scratch every time.</Text>

        {creating && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>New template</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Template name (e.g. Aircon deep clean)" placeholderTextColor={colors.textTertiary} maxLength={120} />
            {items.map((it, i) => (
              <View key={`${it.description}-${i}`} style={styles.itemRow}>
                <Text style={styles.itemDesc}>{it.description}</Text>
                <Text style={styles.itemMeta}>{it.quantity} {it.unit} × {formatPHP(it.unitPrice)}</Text>
                <TouchableOpacity onPress={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.removeX}>×</Text></TouchableOpacity>
              </View>
            ))}
            <TextInput style={styles.input} value={liDesc} onChangeText={setLiDesc} placeholder="Item (e.g. Coil clean)" placeholderTextColor={colors.textTertiary} maxLength={500} />
            <View style={styles.itemFormRow}>
              <TextInput style={[styles.input, styles.small]} value={liQty} onChangeText={setLiQty} placeholder="Qty" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
              <TextInput style={[styles.input, styles.small]} value={liUnit} onChangeText={setLiUnit} placeholder="unit" placeholderTextColor={colors.textTertiary} maxLength={30} />
              <View style={[styles.input, styles.small, styles.priceField]}>
                <Text style={styles.prefix}>{platformConfig.currencySymbol}</Text>
                <TextInput style={styles.priceInput} value={liPrice} onChangeText={setLiPrice} placeholder="Price" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
              </View>
            </View>
            <TouchableOpacity style={[styles.addItemBtn, !canAddItem && styles.disabled]} onPress={addItem} disabled={!canAddItem}><Text style={styles.addItemText}>+ Add item</Text></TouchableOpacity>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, (!name.trim() || items.length === 0) && styles.disabled]} onPress={() => create.mutate()} disabled={!name.trim() || items.length === 0 || create.isPending}>
                {create.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.saveText}>Save template</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {q.isLoading ? (
          <><SkeletonCard /><SkeletonCard /></>
        ) : q.isError ? (
          <ErrorState message={getErrorMessage(q.error, 'Could not load templates.')} onRetry={() => q.refetch()} />
        ) : (q.data ?? []).length === 0 && !creating ? (
          <EmptyState icon="📝" title="No templates yet" description="Create a template once and reuse it on every similar quote." />
        ) : (
          (q.data ?? []).map((t) => (
            <View key={t.id} style={styles.tplCard}>
              <View style={styles.tplTop}>
                <Text style={styles.tplName}>{t.name}</Text>
                <TouchableOpacity onPress={() => remove.mutate(t.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.removeX}>×</Text></TouchableOpacity>
              </View>
              <Text style={styles.tplMeta}>{t.items.length} item{t.items.length !== 1 ? 's' : ''} · {formatPHP(templateTotal(t))}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { ...typography.h3, color: colors.text },
  newBtn: { ...typography.body, fontWeight: '700', color: colors.info },
  scroll: { flex: 1 },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md },
  intro: { ...typography.caption, color: colors.textTertiary, lineHeight: 17 },
  form: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.info, gap: spacing.sm },
  formTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  itemDesc: { ...typography.bodySmall, color: colors.text, fontWeight: '600', flex: 1 },
  itemMeta: { ...typography.caption, color: colors.textSecondary },
  itemFormRow: { flexDirection: 'row', gap: spacing.sm },
  small: { flex: 1 },
  priceField: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 },
  prefix: { fontSize: 14, color: colors.textSecondary, marginRight: 4 },
  priceInput: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: 14, color: colors.text },
  addItemBtn: { backgroundColor: colors.text, borderRadius: borderRadius.md, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  addItemText: { ...typography.bodySmall, fontWeight: '700', color: colors.white },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  cancelBtn: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveText: { ...typography.bodySmall, color: colors.white, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  tplCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tplTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tplName: { ...typography.body, fontWeight: '700', color: colors.text, flex: 1 },
  tplMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  removeX: { fontSize: 20, color: colors.error, fontWeight: '700', paddingHorizontal: 4 },
});
