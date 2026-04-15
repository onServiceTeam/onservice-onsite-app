import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fileDispute } from '@/services/booking.service';

const DISPUTE_TYPES = [
  { value: 'no_show', label: 'No Show', desc: 'Provider did not arrive', icon: '🚫' },
  { value: 'incomplete', label: 'Incomplete Work', desc: 'Job was left unfinished', icon: '🔧' },
  { value: 'substandard', label: 'Substandard Quality', desc: 'Work quality is unsatisfactory', icon: '👎' },
  { value: 'damage', label: 'Property Damage', desc: 'My property was damaged', icon: '🏚️' },
  { value: 'theft', label: 'Theft', desc: 'Items missing after service', icon: '🔒' },
  { value: 'overcharge', label: 'Overcharge', desc: 'Charged more than agreed', icon: '💰' },
  { value: 'other', label: 'Other', desc: 'Something else happened', icon: '❓' },
] as const;

const EVIDENCE_REQUIRED = new Set(['damage', 'theft']);

export default function DisputeScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [disputeType, setDisputeType] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrls] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => fileDispute({
      bookingId: bookingId ?? '',
      type: disputeType,
      description,
      evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
    }),
    onSuccess: () => {
      Alert.alert(
        'Dispute Filed',
        'Your dispute has been submitted. The provider has 24 hours to respond. We\'ll keep you updated.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message);
    },
  });

  const needsEvidence = EVIDENCE_REQUIRED.has(disputeType);
  const isValid = !!disputeType && description.length >= 50;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>File a Dispute</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            Disputes must be filed within 48 hours of job completion. Please provide accurate details.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What happened?</Text>
          {DISPUTE_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[styles.typeOption, disputeType === type.value && styles.typeSelected]}
              onPress={() => setDisputeType(type.value)}
            >
              <Text style={styles.typeIcon}>{type.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeLabel, disputeType === type.value && styles.typeLabelSelected]}>
                  {type.label}
                </Text>
                <Text style={styles.typeDesc}>{type.desc}</Text>
              </View>
              {disputeType === type.value && <Text style={styles.checkMark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
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
            placeholderTextColor="#94A3B8"
            maxLength={2000}
          />
          <Text style={[styles.charCount, description.length < 50 ? styles.charRed : styles.charGreen]}>
            {description.length}/50 min
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence {needsEvidence ? '*' : '(optional)'}</Text>
          {needsEvidence && (
            <Text style={styles.hintWarn}>Photos or videos are strongly recommended for {disputeType} disputes.</Text>
          )}
          <View style={styles.photoGrid}>
            {evidenceUrls.map((_, i) => (
              <View key={i} style={styles.photoThumb}>
                <Text style={styles.photoIcon}>📷</Text>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.photoThumb, styles.addPhoto]}
              onPress={() => Alert.alert('Coming Soon', 'Evidence upload will be available in the next update.')}
            >
              <Text style={styles.addPhotoPlus}>+</Text>
              <Text style={styles.addPhotoLabel}>Add Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What happens next?</Text>
          <Text style={styles.infoStep}>1. Provider is notified and has 24 hours to respond</Text>
          <Text style={styles.infoStep}>2. If accepted, refund is processed automatically</Text>
          <Text style={styles.infoStep}>3. If contested, our support team reviews the case</Text>
          <Text style={styles.infoStep}>4. Unresponded disputes resolve in your favor</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitText}>Submit Dispute</Text>
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
  warningBox: { flexDirection: 'row', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A' },
  warningIcon: { fontSize: 20 },
  warningText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 8 },
  hint: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  hintWarn: { fontSize: 13, color: '#DC2626', marginBottom: 8 },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  typeSelected: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  typeIcon: { fontSize: 22 },
  typeLabel: { fontSize: 14, fontWeight: '600', color: '#1B3A4B' },
  typeLabelSelected: { color: '#DC2626' },
  typeDesc: { fontSize: 12, color: '#64748B', marginTop: 1 },
  checkMark: { fontSize: 18, color: '#DC2626', fontWeight: '700' },
  textArea: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', minHeight: 120 },
  inputError: { borderColor: '#EF4444' },
  charCount: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  charRed: { color: '#EF4444' },
  charGreen: { color: '#10B981' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  photoIcon: { fontSize: 24 },
  addPhoto: { borderStyle: 'dashed', borderColor: '#EF4444' },
  addPhotoPlus: { fontSize: 24, color: '#EF4444' },
  addPhotoLabel: { fontSize: 10, color: '#EF4444', marginTop: 2 },
  infoBox: { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#BAE6FD' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#0C4A6E', marginBottom: 8 },
  infoStep: { fontSize: 13, color: '#0369A1', lineHeight: 20, marginBottom: 2 },
  submitBtn: { backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
