import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createChangeOrder } from '@/services/booking.service';
import { useImagePicker } from '@/hooks/useImagePicker';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { formatPHP } from '@/utils/currency';

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
      Alert.alert('Success', 'Change order submitted. Waiting for customer approval.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? axErr?.message ?? 'Could not submit change order.');
    },
  });

  const amountCentavos = Math.round((Number(amount) || 0) * 100);
  const isValid = description.length >= 10 && amountCentavos >= platformConfig.minimumChangeOrderAmount;

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
          {amountCentavos > 0 && amountCentavos < 100 && (
            <Text style={styles.minWarn}>Minimum amount: {formatPHP(100)}</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  infoBox: { flexDirection: 'row', gap: spacing.sm + 2, backgroundColor: colors.primaryLight, borderRadius: borderRadius.lg, padding: spacing.md + 2, marginBottom: spacing.lg - 4, borderWidth: 1, borderColor: colors.primary },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, ...typography.caption, color: colors.primary, lineHeight: 18 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  textArea: { backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg, padding: spacing.md + 2, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 100 },
  charCount: { fontSize: 12, marginTop: spacing.xs, textAlign: 'right' },
  charRed: { color: colors.error },
  charGreen: { color: colors.success },
  amountField: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md + 2 },
  prefix: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginRight: spacing.xs + 2 },
  amountInput: { flex: 1, paddingVertical: spacing.md + 2, fontSize: 24, fontWeight: '700', color: colors.text },
  minWarn: { fontSize: 12, color: colors.error, marginTop: spacing.xs },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  photoThumb: { width: 80, height: 80, borderRadius: borderRadius.md, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
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
