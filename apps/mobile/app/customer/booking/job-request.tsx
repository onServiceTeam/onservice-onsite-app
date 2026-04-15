import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookingStore } from '@/stores/booking.store';
import { createJobRequest } from '@/services/booking.service';

const URGENCY_OPTIONS = [
  { value: 'same_day' as const, label: 'Same Day', desc: 'Within 4 hours' },
  { value: 'within_3_days' as const, label: 'Within 3 Days', desc: 'Flexible scheduling' },
  { value: 'within_a_week' as const, label: 'Within a Week', desc: 'No rush' },
  { value: 'flexible' as const, label: 'Flexible', desc: 'Provider suggests time' },
];

export default function JobRequestScreen() {
  const router = useRouter();
  const draft = useBookingStore((s) => s.draft);

  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'same_day' | 'within_3_days' | 'within_a_week' | 'flexible'>('within_3_days');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [photoUrls] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!draft.categoryId || !draft.address) {
        throw new Error('Missing category or address');
      }
      return createJobRequest({
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId ?? undefined,
        description,
        address: draft.address,
        barangay: draft.barangay ?? '',
        city: draft.city ?? '',
        province: draft.province ?? '',
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
        urgency,
        budgetMin: budgetMin ? Math.round(Number(budgetMin) * 100) : undefined,
        budgetMax: budgetMax ? Math.round(Number(budgetMax) * 100) : undefined,
        jobPhotos: photoUrls.length > 0 ? photoUrls : undefined,
      });
    },
    onSuccess: (booking) => {
      Alert.alert('Success', 'Your job request has been submitted. Providers will send quotes soon.', [
        { text: 'OK', onPress: () => router.replace(`/customer/booking/${booking.id}` as never) },
      ]);
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message);
    },
  });

  const isValid = description.length >= 50 && draft.categoryId && draft.address;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Custom Quote</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Category</Text>
          <View style={styles.categoryCard}>
            <Text style={styles.categoryName}>{draft.categoryName ?? 'Not selected'}</Text>
            {draft.subcategoryName && (
              <Text style={styles.subcategoryName}>{draft.subcategoryName}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Describe the Job *</Text>
          <Text style={styles.hint}>Minimum 50 characters. Be specific about the problem.</Text>
          <TextInput
            style={[styles.textArea, description.length > 0 && description.length < 50 && styles.inputError]}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue in detail. What needs to be done? What materials might be needed?"
            placeholderTextColor="#94A3B8"
            maxLength={2000}
          />
          <Text style={[styles.charCount, description.length < 50 ? styles.charCountRed : styles.charCountGreen]}>
            {description.length}/50 min
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos (optional)</Text>
          <Text style={styles.hint}>Add photos of the job site (max 10)</Text>
          <View style={styles.photoGrid}>
            {photoUrls.map((_, i) => (
              <View key={i} style={styles.photoThumb}>
                <Text style={styles.photoIcon}>📷</Text>
                <Text style={styles.photoLabel}>Photo {i + 1}</Text>
              </View>
            ))}
            {photoUrls.length < 10 && (
              <TouchableOpacity
                style={[styles.photoThumb, styles.addPhotoBtn]}
                onPress={() => Alert.alert('Coming Soon', 'Photo upload will be available in the next update.')}
              >
                <Text style={styles.addPhotoIcon}>+</Text>
                <Text style={styles.addPhotoText}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Urgency</Text>
          {URGENCY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.urgencyOption, urgency === opt.value && styles.urgencySelected]}
              onPress={() => setUrgency(opt.value)}
            >
              <View style={[styles.radio, urgency === opt.value && styles.radioSelected]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.urgencyLabel, urgency === opt.value && styles.urgencyLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.urgencyDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget Range (optional)</Text>
          <Text style={styles.hint}>Helps providers understand your expectations</Text>
          <View style={styles.budgetRow}>
            <View style={styles.budgetField}>
              <Text style={styles.budgetPrefix}>₱</Text>
              <TextInput
                style={styles.budgetInput}
                keyboardType="numeric"
                value={budgetMin}
                onChangeText={setBudgetMin}
                placeholder="Min"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <Text style={styles.budgetDash}>—</Text>
            <View style={styles.budgetField}>
              <Text style={styles.budgetPrefix}>₱</Text>
              <TextInput
                style={styles.budgetInput}
                keyboardType="numeric"
                value={budgetMax}
                onChangeText={setBudgetMax}
                placeholder="Max"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.addressCard}>
            <Text style={styles.addressText}>
              {draft.address ?? 'No address selected'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Job Request</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>
          Up to 5 providers will send you quotes. You can compare and choose the best one.
        </Text>
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 6 },
  hint: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  categoryCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  categoryName: { fontSize: 15, fontWeight: '600', color: '#1B3A4B' },
  subcategoryName: { fontSize: 13, color: '#64748B', marginTop: 2 },
  textArea: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', minHeight: 120 },
  inputError: { borderColor: '#EF4444' },
  charCount: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  charCountRed: { color: '#EF4444' },
  charCountGreen: { color: '#10B981' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  photoIcon: { fontSize: 24 },
  photoLabel: { fontSize: 10, color: '#64748B', marginTop: 2 },
  addPhotoBtn: { borderStyle: 'dashed', borderColor: '#00B4D8' },
  addPhotoIcon: { fontSize: 24, color: '#00B4D8' },
  addPhotoText: { fontSize: 10, color: '#00B4D8', marginTop: 2 },
  urgencyOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8, gap: 12 },
  urgencySelected: { borderColor: '#00B4D8', backgroundColor: '#F0F9FF' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1' },
  radioSelected: { borderColor: '#00B4D8', backgroundColor: '#00B4D8' },
  urgencyLabel: { fontSize: 14, fontWeight: '600', color: '#1B3A4B' },
  urgencyLabelSelected: { color: '#00B4D8' },
  urgencyDesc: { fontSize: 12, color: '#64748B', marginTop: 1 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  budgetField: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12 },
  budgetPrefix: { fontSize: 14, color: '#64748B', marginRight: 4 },
  budgetInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#1B3A4B' },
  budgetDash: { fontSize: 16, color: '#94A3B8' },
  addressCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  addressText: { fontSize: 14, color: '#1B3A4B' },
  submitBtn: { backgroundColor: '#1B3A4B', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  footer: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
});
