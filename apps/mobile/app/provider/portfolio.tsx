import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-108 fix — paste-image-URL UX replaced with real
// camera/gallery picker + multipart upload.
//
// Pre-fix: provider was prompted to paste an `https://...` image URL.
// In practice, providers don't have one — they have a photo on their
// phone. The backend's POST /api/v1/providers/me/portfolio rejects
// `file://` URIs (MED-N97 hardening) so any local-photo flow failed
// at submit. The screen was technically wired but unusable.
//
// Post-fix: tap "Add Photo" → camera-or-gallery picker → optional
// caption → uploadImages('onboarding') returns a real https URL →
// POST /providers/me/portfolio with that URL. Same multipart pattern
// the rest of the app uses (chat, change-orders, identity-verify).
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  RefreshControl,
  type DimensionValue,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { captureImageAsync, isCameraCaptureAvailable } from '@/utils/image-capture';
import {
  getMyPortfolio,
  addPortfolioItem,
  updatePortfolioItem,
  removePortfolioItem,
  type PortfolioItem,
} from '@/services/provider-api.service';
import { uploadImages } from '@/services/upload.service';
import { getErrorMessage } from '@/utils/errors';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { Button, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera } from '@/components/icons';

type ModalMode = 'add' | 'edit' | null;

export default function PortfolioScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<ModalMode>(null);
  const [editItem, setEditItem] = useState<PortfolioItem | null>(null);
  const [caption, setCaption] = useState('');
  // Phase E CRIT-108 fix — local file URI from picker, before upload.
  const [pendingLocalUri, setPendingLocalUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: portfolio = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-portfolio'],
    queryFn: getMyPortfolio,
  });

  const invalidate = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['my-portfolio'] });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: (data: { imageUrl: string; caption?: string }) => addPortfolioItem(data),
    onSuccess: () => {
      invalidate();
      resetForm();
      showToast('Portfolio photo added.', 'success');
    },
    // Phase E CRIT-108 fix — canonical error helper.
    onError: (err: unknown) =>
      showToast(getErrorMessage(err, 'Could not add portfolio photo.'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { itemId: string; caption?: string }) =>
      updatePortfolioItem(data.itemId, { caption: data.caption }),
    onSuccess: () => {
      invalidate();
      resetForm();
      showToast('Caption updated.', 'success');
    },
    onError: (err: unknown) =>
      showToast(getErrorMessage(err, 'Could not update caption.'), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removePortfolioItem(itemId),
    onSuccess: () => {
      invalidate();
      showToast('Portfolio photo removed.', 'success');
    },
    onError: (err: unknown) =>
      showToast(getErrorMessage(err, 'Could not remove photo.'), 'error'),
  });

  const resetForm = useCallback((): void => {
    setMode(null);
    setEditItem(null);
    setCaption('');
    setPendingLocalUri(null);
  }, []);

  const handleAdd = useCallback((): void => {
    setMode('add');
    setEditItem(null);
    setCaption('');
    setPendingLocalUri(null);
  }, []);

  const handleEdit = useCallback((item: PortfolioItem): void => {
    setMode('edit');
    setEditItem(item);
    setCaption(item.caption ?? '');
    setPendingLocalUri(null);
  }, []);

  // Phase E CRIT-108 fix — open the native picker (camera or gallery).
  // Sets pendingLocalUri to the device file:// URI; we don't upload
  // until the user taps Save so they can change their mind.
  const pickFromGallery = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showToast('Photo library access is needed to select a photo.', 'warning');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingLocalUri(result.assets[0].uri);
    }
  }, []);

  const pickFromCamera = useCallback(async (): Promise<void> => {
    const capture = await captureImageAsync({ quality: 0.8 });
    if (capture.status === 'denied') {
      showToast('Camera access is needed to take a photo.', 'warning');
      return;
    }
    const { result } = capture;
    if (!result.canceled && result.assets[0]) {
      setPendingLocalUri(result.assets[0].uri);
    }
  }, []);

  const showPickerOptions = useCallback((): void => {
    if (!isCameraCaptureAvailable()) {
      // Browsers offer camera vs file in the OS file sheet — the
      // Camera/Library chooser would be two routes to the same picker.
      void pickFromGallery();
      return;
    }
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => { void pickFromCamera(); } },
      { text: 'Photo Library', onPress: () => { void pickFromGallery(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromGallery]);

  const handleSubmit = useCallback((): void => {
    if (mode === 'add') {
      // Phase E CRIT-108 fix — upload the picked file first to get a
      // real https URL, then POST it to /providers/me/portfolio.
      if (!pendingLocalUri) {
        showToast('Please pick a photo to add.', 'warning');
        return;
      }
      void (async () => {
        setIsUploading(true);
        try {
          const uploaded = await uploadImages([pendingLocalUri], 'onboarding');
          const url = uploaded[0]?.url;
          if (!url) throw new Error('Upload returned no URL.');
          addMutation.mutate({ imageUrl: url, caption: caption.trim() || undefined });
        } catch (err) {
          showToast(getErrorMessage(err, 'Could not upload photo.'), 'error');
        } finally {
          setIsUploading(false);
        }
      })();
    } else if (mode === 'edit' && editItem) {
      updateMutation.mutate({ itemId: editItem.id, caption: caption.trim() || undefined });
    }
  }, [mode, pendingLocalUri, caption, editItem, addMutation, updateMutation]);

  const handleRemove = useCallback((item: PortfolioItem): void => {
    Alert.alert('Remove Photo', `Remove "${item.caption || 'this photo'}" from your portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: (): void => { removeMutation.mutate(item.id); } },
    ]);
  }, [removeMutation]);

  const isPending = addMutation.isPending || updateMutation.isPending || isUploading;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load your portfolio. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Portfolio Photos</Text>
        <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {mode && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{mode === 'add' ? 'Add Photo' : 'Edit Caption'}</Text>
          {/* Phase E CRIT-108 fix — picker preview replaces the
               paste-URL TextInput. */}
          {mode === 'add' && (
            <>
              {pendingLocalUri ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: pendingLocalUri }} style={styles.previewImg} resizeMode="cover" />
                  <TouchableOpacity onPress={showPickerOptions} style={styles.changeBtn} disabled={isPending}>
                    <Text style={styles.changeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={showPickerOptions}
                  style={styles.pickerCard}
                  activeOpacity={0.8}
                  disabled={isPending}
                >
                  <Camera size={40} color={colors.textTertiary} style={styles.pickerIcon} />
                  <Text style={styles.pickerTitle}>Tap to add photo</Text>
                  <Text style={styles.pickerHint}>Camera or photo library</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {/* BUG-PHASE197-01 fix — pre-fix the caption TextInput had
              no maxLength. Phase 152 set PORTFOLIO_CAPTION_MAX = 500
              at the route. A provider typing 600 chars hit Save and
              got a 400 with no field-level guidance. Same Phase 145/
              194/195 maxLength-sweep fix family. */}
          <TextInput
            style={styles.input}
            value={caption}
            onChangeText={setCaption}
            placeholder="Caption (optional)"
            placeholderTextColor={colors.textTertiary}
            editable={!isPending}
            maxLength={500}
          />
          <View style={styles.formActions}>
            <Button title="Cancel" onPress={resetForm} variant="ghost" />
            <Button
              title={isUploading ? 'Uploading...' : isPending ? 'Saving...' : 'Save'}
              onPress={handleSubmit}
              loading={isPending}
              disabled={isPending || (mode === 'add' && !pendingLocalUri)}
            />
          </View>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.secondary} />}
      >
        {portfolio.length === 0 ? (
          <EmptyState
            icon="📷"
            title="No Portfolio Photos Yet"
            description="Add photos of your past work to build trust with customers and showcase your skills."
            actionLabel="Add Your First Photo"
            onAction={handleAdd}
          />
        ) : (
          <View style={styles.grid}>
            {portfolio.map((item) => (
              <View key={item.id} style={styles.photoCard}>
                <Image source={{ uri: item.imageUrl }} style={styles.photo} resizeMode="cover" />
                {item.caption ? (
                  <Text style={styles.photoCaption} numberOfLines={2}>{item.caption}</Text>
                ) : null}
                <View style={styles.photoActions}>
                  <TouchableOpacity
                    onPress={(): void => { handleEdit(item); }}
                    style={styles.photoActionBtn}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(): void => { handleRemove(item); }}
                    style={styles.photoActionBtn}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addButtonText: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },

  formCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    margin: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  formTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  emptyState: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { marginBottom: spacing.base },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoCard: {
    width: '48%' as DimensionValue,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.border,
  },
  photoCaption: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  photoActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  photoActionBtn: { padding: spacing.md, minHeight: 44, minWidth: 44, justifyContent: 'center' as const },
  editText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  removeText: { ...typography.caption, color: colors.error, fontWeight: '600' },

  // Phase E CRIT-108 fix — picker UI styles.
  pickerCard: {
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed' as const,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerIcon: { marginBottom: spacing.xs },
  pickerTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  pickerHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  previewWrap: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  previewImg: {
    width: '100%',
    aspectRatio: 1,
  },
  changeBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  changeBtnText: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },
});
