import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { submitQuote } from '@/services/booking.service';

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

export default function QuoteBuilderScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([createEmptyItem()]);

  const addItem = () => setItems([...items, createEmptyItem()]);

  const updateItem = (id: number, field: keyof LineItemDraft, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: number) => {
    if (items.length > 1) setItems(items.filter(item => item.id !== id));
  };

  const totalAmount = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Math.round((Number(item.unitPrice) || 0) * 100);
    return sum + Math.round(qty * price);
  }, 0);

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
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const isValid = description.length >= 10 && totalAmount >= 10000 && items.some(i => i.description && Number(i.unitPrice) > 0);

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
            placeholderTextColor="#94A3B8"
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
                  <TouchableOpacity onPress={() => removeItem(item.id)}>
                    <Text style={styles.removeItem}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.input}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, 'description', v)}
                placeholder="Item description"
                placeholderTextColor="#94A3B8"
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
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.fieldMedium}>
                  <Text style={styles.fieldLabel}>Unit Price (₱)</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="numeric"
                    value={item.unitPrice}
                    onChangeText={(v) => updateItem(item.id, 'unitPrice', v)}
                    placeholder="0.00"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {Number(item.quantity) > 0 && Number(item.unitPrice) > 0 && (
                <Text style={styles.lineTotal}>
                  Subtotal: ₱{(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
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
              placeholderTextColor="#94A3B8"
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
            placeholderTextColor="#94A3B8"
            maxLength={2000}
          />
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total Quote</Text>
          <Text style={styles.totalValue}>
            ₱{(totalAmount / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </Text>
          {totalAmount > 0 && totalAmount < 10000 && (
            <Text style={styles.minWarn}>Minimum quote: ₱100.00</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitText}>Submit Quote</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: '#1B3A4B' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1B3A4B' },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 8 },
  textArea: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', minHeight: 80 },
  input: { backgroundColor: '#FFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', marginBottom: 8 },
  addItemBtn: { backgroundColor: '#F0F9FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addItemText: { fontSize: 13, fontWeight: '600', color: '#00B4D8' },
  lineItemCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
  lineItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  lineItemNum: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  removeItem: { fontSize: 16, color: '#EF4444', fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  typeChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#F1F5F9' },
  typeChipActive: { backgroundColor: '#1B3A4B' },
  typeChipText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  typeChipTextActive: { color: '#FFF' },
  qtyPriceRow: { flexDirection: 'row', gap: 8 },
  fieldSmall: { flex: 1 },
  fieldMedium: { flex: 2 },
  fieldLabel: { fontSize: 11, color: '#64748B', marginBottom: 4 },
  smallInput: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B' },
  lineTotal: { fontSize: 13, fontWeight: '600', color: '#10B981', textAlign: 'right', marginTop: 8 },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  daysInput: { width: 80, backgroundColor: '#FFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', textAlign: 'center' },
  daysLabel: { fontSize: 14, color: '#64748B' },
  totalBox: { backgroundColor: '#1B3A4B', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
  totalLabel: { fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  totalValue: { fontSize: 28, fontWeight: '800', color: '#FFF', marginTop: 4 },
  minWarn: { fontSize: 12, color: '#F59E0B', marginTop: 4 },
  submitBtn: { backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
