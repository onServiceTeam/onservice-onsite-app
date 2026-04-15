import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createChangeOrder } from '@/services/booking.service';

export default function ChangeOrderFormScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () => createChangeOrder(bookingId ?? '', {
      description,
      additionalAmount: Math.round((Number(amount) || 0) * 100),
    }),
    onSuccess: () => {
      Alert.alert('Success', 'Change order submitted. Waiting for customer approval.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const amountCentavos = Math.round((Number(amount) || 0) * 100);
  const isValid = description.length >= 10 && amountCentavos >= 100;

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
          <Text style={styles.infoIcon}>ℹ️</Text>
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
            placeholderTextColor="#94A3B8"
            maxLength={2000}
          />
          <Text style={[styles.charCount, description.length < 10 ? styles.charRed : styles.charGreen]}>
            {description.length}/10 min
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Amount *</Text>
          <View style={styles.amountField}>
            <Text style={styles.prefix}>₱</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
            />
          </View>
          {amountCentavos > 0 && amountCentavos < 100 && (
            <Text style={styles.minWarn}>Minimum amount: ₱1.00</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos (optional)</Text>
          <Text style={styles.hint}>Add photos showing why additional work is needed</Text>
          <TouchableOpacity
            style={styles.addPhotoBtn}
            onPress={() => Alert.alert('Coming Soon', 'Photo upload will be available in the next update.')}
          >
            <Text style={styles.addPhotoPlus}>+</Text>
            <Text style={styles.addPhotoLabel}>Add Photos</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Note: Change orders exceeding 50% of the original job cost may require admin approval.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitText}>Submit Change Order</Text>
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
  infoBox: { flexDirection: 'row', gap: 10, backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#BAE6FD' },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: 13, color: '#0369A1', lineHeight: 18 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 8 },
  hint: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  textArea: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', minHeight: 100 },
  charCount: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  charRed: { color: '#EF4444' },
  charGreen: { color: '#10B981' },
  amountField: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14 },
  prefix: { fontSize: 18, fontWeight: '600', color: '#64748B', marginRight: 6 },
  amountInput: { flex: 1, paddingVertical: 14, fontSize: 24, fontWeight: '700', color: '#1B3A4B' },
  minWarn: { fontSize: 12, color: '#EF4444', marginTop: 4 },
  addPhotoBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  addPhotoPlus: { fontSize: 28, color: '#94A3B8' },
  addPhotoLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  noteBox: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A' },
  noteText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  submitBtn: { backgroundColor: '#1B3A4B', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
