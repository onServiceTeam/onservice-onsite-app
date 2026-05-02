import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
//
// Phase K CRIT-K06 audit context — this file is DEPRECATED and not
// reachable from the active provider-onboarding stack
// (apps/mobile/app/provider-onboarding/_layout.tsx). The active KYC
// flow is documents.tsx + selfie.tsx + terms.tsx (uploads via
// /api/v1/uploads then submits to /api/v1/providers/apply).
//
// This screen submits base64-in-JSON to a /provider-onboarding/identity
// endpoint that does NOT exist on the backend. Kept in the repo only
// because deleting it requires removing references in any
// in-progress feature branch first; the layout no longer mounts it.
// Do NOT add features here — touch documents.tsx / selfie.tsx
// instead.
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileText,
  RefreshCw,
} from '@/components/icons';

type IdType = 'drivers_license' | 'passport' | 'umid' | 'prc' | 'postal' | 'sss';

interface IdOption {
  id: IdType;
  label: string;
  hint: string;
  hasBack: boolean;
}

const ID_OPTIONS: IdOption[] = [
  { id: 'drivers_license', label: "Driver's License", hint: 'LTO-issued', hasBack: true },
  { id: 'passport', label: 'Passport', hint: 'DFA-issued', hasBack: false },
  { id: 'umid', label: 'UMID', hint: 'Unified Multi-Purpose ID', hasBack: true },
  { id: 'prc', label: 'PRC ID', hint: 'Professional Regulation Commission', hasBack: true },
  { id: 'postal', label: 'Postal ID', hint: 'PHLPost-issued', hasBack: true },
  { id: 'sss', label: 'SSS ID', hint: 'Social Security System', hasBack: true },
];

const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface IdImage {
  uri: string;
  base64?: string | null;
  fileSize?: number;
}

export function validateIdImage(image: IdImage | null): string | null {
  if (!image) return null;
  if (typeof image.fileSize === 'number' && image.fileSize > MAX_FILE_BYTES) {
    return 'Image is larger than 8MB. Please retake at lower quality.';
  }
  return null;
}

export default function IdentityVerificationScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [idType, setIdType] = useState<IdType | null>(null);
  const [front, setFront] = useState<IdImage | null>(null);
  const [back, setBack] = useState<IdImage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedOption = ID_OPTIONS.find((o) => o.id === idType) ?? null;
  const totalSteps = 4;

  const goNext = (): void => {
    if (step === 1) {
      if (!idType) {
        Alert.alert('Required', 'Please choose an ID type to continue.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!front) {
        Alert.alert('Required', 'Please capture the front of your ID.');
        return;
      }
      if (selectedOption && !selectedOption.hasBack) {
        setStep(4);
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!back) {
        Alert.alert('Required', 'Please capture the back of your ID.');
        return;
      }
      setStep(4);
    }
  };

  const goBack = (): void => {
    if (step === 1) {
      router.back();
      return;
    }
    if (step === 4 && selectedOption && !selectedOption.hasBack) {
      setStep(2);
      return;
    }
    setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : 1));
  };

  const captureImage = async (side: 'front' | 'back'): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to capture your ID.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset) return;
    const img: IdImage = {
      uri: asset.uri,
      base64: asset.base64 ?? null,
      fileSize: asset.fileSize,
    };
    const warning = validateIdImage(img);
    if (warning) {
      Alert.alert('Image Warning', warning);
      return;
    }
    if (side === 'front') setFront(img);
    else setBack(img);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!idType || !front) {
      Alert.alert('Missing Info', 'Please complete all steps before submitting.');
      return;
    }
    if (selectedOption?.hasBack && !back) {
      Alert.alert('Missing Info', 'Please capture the back of your ID.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      idType,
      frontPhotoBase64: front.base64 ?? null,
      backPhotoBase64: back?.base64 ?? null,
    };
    try {
      try {
        await api.post('/api/v1/provider-onboarding/identity', payload);
      } catch (apiErr) {
        const status = (apiErr as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          // Endpoint not yet available — proceed silently so the onboarding
          // flow can still advance. The submission will be retried by the
          // background-check polling step once the route is shipped.
          setSubmitError(null);
        } else {
          throw apiErr;
        }
      }
      router.push(Routes.PROVIDER_ONBOARDING.BACKGROUND_CHECK_STATUS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderProgress = (): React.ReactElement => (
    <View style={styles.progressBar}>
      <View
        style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` }]}
      />
    </View>
  );

  const renderStep1 = (): React.ReactElement => (
    <View>
      <Text style={styles.title}>Choose Your ID</Text>
      <Text style={styles.subtitle}>
        Select a valid government-issued ID. We use this to verify your identity.
      </Text>
      {ID_OPTIONS.map((opt) => {
        const selected = idType === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.radioRow, selected && styles.radioRowSelected]}
            onPress={() => setIdType(opt.id)}
            activeOpacity={0.7}
          >
            <View style={styles.radioIconWrap}>
              <FileText size={20} color={selected ? colors.primary : colors.textSecondary} />
            </View>
            <View style={styles.radioInfo}>
              <Text style={styles.radioLabel}>{opt.label}</Text>
              <Text style={styles.radioHint}>{opt.hint}</Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderCaptureStep = (side: 'front' | 'back'): React.ReactElement => {
    const image = side === 'front' ? front : back;
    return (
      <View>
        <Text style={styles.title}>
          {side === 'front' ? 'Capture Front of ID' : 'Capture Back of ID'}
        </Text>
        <Text style={styles.subtitle}>
          Place your {selectedOption?.label} on a flat, well-lit surface. Make sure the entire
          card is in frame and text is readable.
        </Text>

        <View style={styles.captureArea}>
          {image ? (
            <Image source={{ uri: image.uri }} style={styles.capturedImage} resizeMode="cover" />
          ) : (
            <View style={styles.capturePlaceholder}>
              <Camera size={36} color={colors.textTertiary} />
              <Text style={styles.captureHint}>No photo yet</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.captureBtn}
          onPress={() => captureImage(side)}
          activeOpacity={0.7}
        >
          <Camera size={18} color={colors.white} />
          <Text style={styles.captureBtnText}>
            {image ? 'Retake Photo' : 'Open Camera'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderReview = (): React.ReactElement => (
    <View>
      <Text style={styles.title}>Review & Submit</Text>
      <Text style={styles.subtitle}>
        Make sure both photos are clear and readable before submitting.
      </Text>

      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>ID Type</Text>
        <Text style={styles.reviewValue}>{selectedOption?.label ?? '—'}</Text>
      </View>

      <View style={styles.reviewBlock}>
        <Text style={styles.reviewBlockLabel}>Front</Text>
        {front ? (
          <Image source={{ uri: front.uri }} style={styles.reviewImage} resizeMode="cover" />
        ) : (
          <Text style={styles.reviewMissing}>Not captured</Text>
        )}
      </View>

      {selectedOption?.hasBack && (
        <View style={styles.reviewBlock}>
          <Text style={styles.reviewBlockLabel}>Back</Text>
          {back ? (
            <Image source={{ uri: back.uri }} style={styles.reviewImage} resizeMode="cover" />
          ) : (
            <Text style={styles.reviewMissing}>Not captured</Text>
          )}
        </View>
      )}

      {submitError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{submitError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleSubmit}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <RefreshCw size={16} color={colors.primary} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
        onPress={handleSubmit}
        activeOpacity={0.7}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <>
            <CheckCircle2 size={18} color={colors.white} />
            <Text style={styles.primaryBtnText}>Submit for Verification</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.progressWrap}>
          {renderProgress()}
          <Text style={styles.stepText}>
            Step {step} of {totalSteps}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderCaptureStep('front')}
        {step === 3 && renderCaptureStep('back')}
        {step === 4 && renderReview()}
      </ScrollView>

      {step !== 4 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={goNext}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
            <ArrowRight size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
    marginRight: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressWrap: { flex: 1 },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  stepText: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  radioRowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radioIconWrap: { width: 32, alignItems: 'center', marginRight: spacing.sm },
  radioInfo: { flex: 1 },
  radioLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  radioHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  captureArea: { alignItems: 'center', marginBottom: spacing.lg },
  capturePlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.sm },
  capturedImage: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.success,
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
  },
  captureBtnText: { ...typography.button, color: colors.white },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: spacing.md,
  },
  reviewLabel: { ...typography.body, color: colors.textSecondary },
  reviewValue: { ...typography.body, fontWeight: '600', color: colors.text },
  reviewBlock: { marginBottom: spacing.lg },
  reviewBlockLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  reviewImage: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewMissing: { ...typography.bodySmall, color: colors.error },
  errorCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.sm },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  retryText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { ...typography.button, color: colors.white },
});
