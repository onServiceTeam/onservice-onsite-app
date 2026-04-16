import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  type DimensionValue,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyPortfolio,
  addPortfolioItem,
  updatePortfolioItem,
  removePortfolioItem,
  type PortfolioItem,
} from '@/services/provider-api.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

type ModalMode = 'add' | 'edit' | null;

export default function PortfolioScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<ModalMode>(null);
  const [editItem, setEditItem] = useState<PortfolioItem | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');

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
      Alert.alert('Success', 'Portfolio photo added.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { itemId: string; caption?: string }) =>
      updatePortfolioItem(data.itemId, { caption: data.caption }),
    onSuccess: () => {
      invalidate();
      resetForm();
      Alert.alert('Updated', 'Caption updated.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removePortfolioItem(itemId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Removed', 'Portfolio photo removed.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const resetForm = useCallback((): void => {
    setMode(null);
    setEditItem(null);
    setImageUrl('');
    setCaption('');
  }, []);

  const handleAdd = useCallback((): void => {
    setMode('add');
    setEditItem(null);
    setImageUrl('');
    setCaption('');
  }, []);

  const handleEdit = useCallback((item: PortfolioItem): void => {
    setMode('edit');
    setEditItem(item);
    setCaption(item.caption ?? '');
  }, []);

  const handleSubmit = useCallback((): void => {
    if (mode === 'add') {
      if (!imageUrl.trim()) {
        Alert.alert('Required', 'Please enter an image URL.');
        return;
      }
      addMutation.mutate({ imageUrl: imageUrl.trim(), caption: caption.trim() || undefined });
    } else if (mode === 'edit' && editItem) {
      updateMutation.mutate({ itemId: editItem.id, caption: caption.trim() || undefined });
    }
  }, [mode, imageUrl, caption, editItem, addMutation, updateMutation]);

  const handleRemove = useCallback((item: PortfolioItem): void => {
    Alert.alert('Remove Photo', `Remove "${item.caption || 'this photo'}" from your portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: (): void => { removeMutation.mutate(item.id); } },
    ]);
  }, [removeMutation]);

  const isPending = addMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⚠️</Text>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load portfolio. Please try again.</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
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
          {mode === 'add' && (
            <TextInput
              style={styles.input}
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="Image URL (https://...)"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="url"
            />
          )}
          <TextInput
            style={styles.input}
            value={caption}
            onChangeText={setCaption}
            placeholder="Caption (optional)"
            placeholderTextColor={colors.textTertiary}
          />
          <View style={styles.formActions}>
            <Button title="Cancel" onPress={resetForm} variant="ghost" />
            <Button
              title={isPending ? 'Saving...' : 'Save'}
              onPress={handleSubmit}
              loading={isPending}
              disabled={isPending}
            />
          </View>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.secondary} />}
      >
        {portfolio.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={styles.emptyTitle}>No Portfolio Photos Yet</Text>
            <Text style={styles.emptyDesc}>
              Add photos of your past work to build trust with customers and showcase your skills.
            </Text>
            <Button title="Add Your First Photo" onPress={handleAdd} />
          </View>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
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
    backgroundColor: colors.backgroundSecondary,
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
  emptyIcon: { fontSize: 64, marginBottom: spacing.base },
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
    backgroundColor: colors.backgroundSecondary,
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
});
