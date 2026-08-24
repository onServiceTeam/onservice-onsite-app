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
import { ChevronLeft, Pencil } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import ConfirmModal from '@/components/ConfirmModal';
import { getMyServices } from '@/services/provider-api.service';
import { useResponsive } from '@/hooks/useResponsive';

type DraftItem = Omit<TemplateItem, 'id' | 'sortOrder'>;

function templateTotal(t: QuoteTemplate): number {
  return t.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
}

export default function QuoteTemplatesScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone, isDesktop } = useResponsive();
  const q = useQuery({ queryKey: ['quote-templates'], queryFn: listTemplates, staleTime: 60 * 1000 });
  const servicesQuery = useQuery({ queryKey: ['myServices'], queryFn: getMyServices, staleTime: 60 * 1000 });
  const invalidate = (): void => { void queryClient.invalidateQueries({ queryKey: ['quote-templates'] }); };

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [liDesc, setLiDesc] = useState('');
  const [liQty, setLiQty] = useState('1');
  const [liUnit, setLiUnit] = useState('unit');
  const [liPrice, setLiPrice] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuoteTemplate | null>(null);

  const quantity = Number(liQty);
  const unitPrice = Math.round(Number(liPrice) * 100);
  const canAddItem = items.length < 20
    && liDesc.trim().length > 0
    && liDesc.trim().length <= 500
    && Number.isFinite(quantity)
    && quantity >= 0.01
    && quantity <= 99999
    && liUnit.trim().length > 0
    && liUnit.trim().length <= 30
    && Number.isSafeInteger(unitPrice)
    && unitPrice > 0
    && unitPrice <= 100_000_000;
  function addItem(): void {
    if (!canAddItem) return;
    setItems((prev) => [...prev, { description: liDesc.trim(), quantity, unit: liUnit.trim(), unitPrice, itemType: 'labor' }]);
    setLiDesc(''); setLiQty('1'); setLiUnit('unit'); setLiPrice('');
  }
  function resetForm(): void { setCreating(false); setName(''); setItems([]); setLiDesc(''); setLiQty('1'); setLiUnit('unit'); setLiPrice(''); setSelectedServiceId(null); }

  const offeredServices = servicesQuery.data ?? [];
  const quoteServices = offeredServices.filter((service) => service.pricingType === 'quote');
  const selectedService = quoteServices.find((service) => service.subcategoryId === selectedServiceId);
  const serviceName = (template: QuoteTemplate): string | null => {
    if (!template.subcategoryId) return template.categoryId ? 'Category template' : 'All quote services';
    return offeredServices.find((service) => service.subcategoryId === template.subcategoryId)?.subcategoryName ?? 'Service no longer offered';
  };

  const create = useMutation({
    mutationFn: () => createTemplate({
      name: name.trim(),
      items,
      ...(selectedService?.categoryId ? { categoryId: selectedService.categoryId } : {}),
      ...(selectedService ? { subcategoryId: selectedService.subcategoryId } : {}),
    }),
    onSuccess: () => { resetForm(); invalidate(); showToast('Template saved.', 'success'); },
    onError: (e) => showToast(getErrorMessage(e, 'Could not save the template.'), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      setPendingDelete(null);
      invalidate();
      showToast('Template deleted.', 'success');
    },
    onError: (e) => showToast(getErrorMessage(e, 'Could not delete the template.'), 'error'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={[styles.headerInner, !isPhone && styles.headerInnerWide]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quote Templates</Text>
          {!creating ? (
            <TouchableOpacity onPress={() => setCreating(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={styles.newBtn}>+ New</Text></TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}>
        <View
          style={[styles.workspace, isDesktop && styles.workspaceDesktop]}
          accessibilityLabel={isPhone ? 'Provider quote templates' : 'Tablet and desktop provider quote template workspace'}
        >
        <View style={[styles.editorColumn, isDesktop && styles.editorColumnDesktop]}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Reusable quote building blocks</Text>
          <Text style={styles.intro}>Save line items once, optionally link them to one of your quote-based services, and load them into a customer quote without retyping.</Text>
        </View>

        {creating && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>New template</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Template name (e.g. Aircon deep clean)" placeholderTextColor={colors.textTertiary} maxLength={120} />
            <Text style={styles.fieldLabel}>Use for service (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceOptions}>
              <TouchableOpacity
                style={[styles.serviceChip, selectedServiceId === null && styles.serviceChipSelected]}
                onPress={() => setSelectedServiceId(null)}
              >
                <Text style={[styles.serviceChipText, selectedServiceId === null && styles.serviceChipTextSelected]}>All quote services</Text>
              </TouchableOpacity>
              {quoteServices.map((service) => (
                <TouchableOpacity
                  key={service.subcategoryId}
                  style={[styles.serviceChip, selectedServiceId === service.subcategoryId && styles.serviceChipSelected]}
                  onPress={() => setSelectedServiceId(service.subcategoryId)}
                >
                  <Text style={[styles.serviceChipText, selectedServiceId === service.subcategoryId && styles.serviceChipTextSelected]}>{service.subcategoryName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {servicesQuery.isError ? <Text style={styles.fieldHelp}>Your services could not be loaded. You can still save an all-services template.</Text> : null}
            {items.map((it, i) => (
              <View key={`${it.description}-${i}`} style={styles.itemRow}>
                <Text style={styles.itemDesc}>{it.description}</Text>
                <Text style={styles.itemMeta}>{it.quantity} {it.unit} × {formatPHP(it.unitPrice)}</Text>
                <TouchableOpacity onPress={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.removeX}>×</Text></TouchableOpacity>
              </View>
            ))}
            <TextInput style={styles.input} value={liDesc} onChangeText={setLiDesc} placeholder="Item (e.g. Coil clean)" placeholderTextColor={colors.textTertiary} maxLength={500} />
            <View style={styles.itemFormRow}>
              <TextInput style={[styles.input, styles.small]} value={liQty} onChangeText={setLiQty} placeholder="Qty" placeholderTextColor={colors.textTertiary} keyboardType="numeric" maxLength={8} />
              <TextInput style={[styles.input, styles.small]} value={liUnit} onChangeText={setLiUnit} placeholder="unit" placeholderTextColor={colors.textTertiary} maxLength={30} />
              <View style={[styles.input, styles.small, styles.priceField]}>
                <Text style={styles.prefix}>{platformConfig.currencySymbol}</Text>
                <TextInput style={styles.priceInput} value={liPrice} onChangeText={setLiPrice} placeholder="Price" placeholderTextColor={colors.textTertiary} keyboardType="numeric" maxLength={10} />
              </View>
            </View>
            <TouchableOpacity style={[styles.addItemBtn, !canAddItem && styles.disabled]} onPress={addItem} disabled={!canAddItem}><Text style={styles.addItemText}>+ Add item</Text></TouchableOpacity>
            <Text style={styles.fieldHelp}>Up to 20 items. Each price is stored in centavos and revalidated when the customer quote is submitted.</Text>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, (!name.trim() || items.length === 0) && styles.disabled]} onPress={() => create.mutate()} disabled={!name.trim() || items.length === 0 || create.isPending}>
                {create.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.saveText}>Save template</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
        </View>

        <View style={[styles.templateColumn, isDesktop && styles.templateColumnDesktop]}>
        {q.isLoading ? (
          <><SkeletonCard /><SkeletonCard /></>
        ) : q.isError ? (
          <ErrorState message={getErrorMessage(q.error, 'Could not load templates.')} onRetry={() => q.refetch()} />
        ) : (q.data ?? []).length === 0 && !creating ? (
          <EmptyState icon={<Pencil size={48} color={colors.textTertiary} />} title="No templates yet" description="Create a template once and reuse it on every similar quote." />
        ) : (
          (q.data ?? []).map((t) => (
            <View key={t.id} style={styles.tplCard}>
              <View style={styles.tplTop}>
                <Text style={styles.tplName}>{t.name}</Text>
                <TouchableOpacity onPress={() => setPendingDelete(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Delete ${t.name}`}><Text style={styles.removeX}>×</Text></TouchableOpacity>
              </View>
              <Text style={styles.tplMeta}>{t.items.length} item{t.items.length !== 1 ? 's' : ''} · {formatPHP(templateTotal(t))}</Text>
              <Text style={styles.tplScope}>{serviceName(t)}</Text>
            </View>
          ))
        )}
        </View>
        </View>
      </ScrollView>
      <ConfirmModal
        visible={pendingDelete != null}
        title="Delete quote template?"
        message={pendingDelete ? `Delete “${pendingDelete.name}”? Existing quotes will not change, but this template cannot be restored.` : undefined}
        confirmLabel="Delete template"
        destructive
        loading={remove.isPending}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id); }}
        onCancel={() => { if (!remove.isPending) setPendingDelete(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  headerInnerWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: spacing.xl },
  headerTitle: { ...typography.h3, color: colors.text },
  newBtn: { ...typography.body, fontWeight: '700', color: colors.info },
  scroll: { flex: 1 },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md },
  bodyWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%', gap: spacing.md },
  workspaceDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  editorColumn: { minWidth: 0, gap: spacing.md },
  editorColumnDesktop: { width: 480 },
  templateColumn: { minWidth: 0, gap: spacing.md },
  templateColumnDesktop: { flex: 1 },
  introCard: { backgroundColor: colors.primaryDark, borderRadius: borderRadius.lg, padding: spacing.lg },
  introTitle: { ...typography.h3, color: colors.white, marginBottom: spacing.sm },
  intro: { ...typography.bodySmall, color: colors.primaryLight, lineHeight: 20 },
  form: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.info, gap: spacing.sm },
  formTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.xs },
  fieldHelp: { ...typography.caption, color: colors.textTertiary, lineHeight: 17 },
  serviceOptions: { gap: spacing.sm, paddingRight: spacing.base },
  serviceChip: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceMuted },
  serviceChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  serviceChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  serviceChipTextSelected: { color: colors.primary },
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
  tplScope: { ...typography.caption, color: colors.primary, marginTop: spacing.xs, fontWeight: '600' },
  removeX: { fontSize: 20, color: colors.error, fontWeight: '700', paddingHorizontal: 4 },
});
