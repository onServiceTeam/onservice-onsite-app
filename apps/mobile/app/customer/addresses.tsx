import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator, TextInput, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as addressService from '@/services/address.service';
import type { SavedAddress } from '@/services/address.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 R5-complete — ConfirmModal for delete-address destructive flow.
import ConfirmModal from '@/components/ConfirmModal';
import type { ComponentType } from 'react';
import { Home as HomeIcon, Briefcase, Pin, AlertTriangle } from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const LABEL_OPTIONS: Array<{ value: SavedAddress['label']; icon: IconComponent }> = [
  { value: 'Home', icon: HomeIcon },
  { value: 'Work', icon: Briefcase },
  { value: 'Other', icon: Pin },
];

export default function AddressesScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [label, setLabel] = useState<SavedAddress['label']>('Home');
  const [fullAddress, setFullAddress] = useState('');
  const [barangay, setBarangay] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const { data: addresses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressService.getAddresses,
  });

  const resetForm = useCallback(() => {
    setLabel('Home');
    setFullAddress('');
    setBarangay('');
    setCity('');
    setProvince('');
    setNotes('');
    setIsDefault(false);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof addressService.createAddress>[0]) =>
      addressService.createAddress(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      resetForm();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to save address.';
      Alert.alert('Error', msg);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof addressService.updateAddress>[1] }) =>
      addressService.updateAddress(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      resetForm();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to update address.';
      Alert.alert('Error', msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: addressService.deleteAddress,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
    onError: () => Alert.alert('Error', 'Failed to delete address.'),
  });

  const handleSave = (): void => {
    if (isSaving) return;
    if (!fullAddress.trim() || !barangay.trim() || !city.trim() || !province.trim()) {
      Alert.alert('Required', 'Please fill in all required fields.');
      return;
    }
    if (fullAddress.trim().length < 5) {
      Alert.alert('Too Short', 'Full address must be at least 5 characters.');
      return;
    }
    const payload = {
      label,
      fullAddress: fullAddress.trim(),
      barangay: barangay.trim(),
      city: city.trim(),
      province: province.trim(),
      isDefault,
      notes: notes.trim() || undefined,
    };

    if (editingId) {
      updateMut.mutate({ id: editingId, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleEdit = (addr: SavedAddress): void => {
    setEditingId(addr.id);
    setLabel(addr.label);
    setFullAddress(addr.fullAddress);
    setBarangay(addr.barangay);
    setCity(addr.city);
    setProvince(addr.province);
    setNotes(addr.notes ?? '');
    setIsDefault(addr.isDefault);
    setShowForm(true);
  };

  // Phase 14 R5-complete — ConfirmModal replaces Alert.alert for delete-address.
  const [pendingDelete, setPendingDelete] = useState<SavedAddress | null>(null);
  const handleDelete = (addr: SavedAddress): void => setPendingDelete(addr);

  const handleSetDefault = (addr: SavedAddress): void => {
    if (addr.isDefault) return;
    updateMut.mutate({ id: addr.id, data: { isDefault: true } });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  if (!showForm && isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My Addresses</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ marginBottom: 12, alignItems: 'center' as const }}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load addresses. Please try again.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderAddress = ({ item }: { item: SavedAddress }): React.ReactElement => {
    const ItemIcon = LABEL_OPTIONS.find((l) => l.value === item.label)?.icon ?? Pin;
    return (
      <View style={[styles.addressCard, item.isDefault && styles.addressCardDefault]}>
        <View style={styles.addressHeader}>
          <View style={styles.addressIconWrap}><ItemIcon size={22} color={colors.primary} /></View>
          <View style={styles.addressInfo}>
            <View style={styles.addressLabelRow}>
              <Text style={styles.addressLabel}>{item.label}</Text>
              {item.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              )}
            </View>
            <Text style={styles.addressText} numberOfLines={2}>{item.fullAddress}</Text>
            <Text style={styles.addressArea}>
              {[item.barangay, item.city, item.province].filter(Boolean).join(', ')}
            </Text>
            {item.notes ? <Text style={styles.addressNotes}>{item.notes}</Text> : null}
          </View>
        </View>
        <View style={styles.addressActions}>
          {!item.isDefault && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleSetDefault(item)}>
              <Text style={styles.actionBtnText}>Set Default</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item)}>
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(item)}>
            <Text style={styles.actionBtnTextDanger}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (showForm) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={resetForm} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{editingId ? 'Edit Address' : 'Add Address'}</Text>
        </View>

        <ScrollView style={styles.formBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.formLabel}>Label</Text>
          <View style={styles.labelGrid}>
            {LABEL_OPTIONS.map((opt) => {
              const ChipIcon = opt.icon;
              return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.labelChip, label === opt.value && styles.labelChipActive]}
                onPress={() => setLabel(opt.value)}
              >
                <View style={styles.labelChipIconWrap}><ChipIcon size={18} color={label === opt.value ? colors.primary : colors.textSecondary} /></View>
                <Text style={[styles.labelChipText, label === opt.value && styles.labelChipTextActive]}>
                  {opt.value}
                </Text>
              </TouchableOpacity>
              );
            })}
          </View>

          {/* BUG-PHASE148-01 fix — pre-fix all five address fields
              had no maxLength. Server's createAddressSchema caps:
                fullAddress.max(500), barangay/city/province.max(100),
                notes.max(500) (address.validators.ts:13-22).
              Same Phase 145/146/147 maxLength-sweep fix family. */}
          <Text style={styles.formLabel}>Full Address *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Purok 3, Brgy. San Antonio"
            placeholderTextColor={colors.textTertiary}
            value={fullAddress}
            onChangeText={setFullAddress}
            multiline
            maxLength={500}
          />

          <Text style={styles.formLabel}>Barangay *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. San Antonio"
            placeholderTextColor={colors.textTertiary}
            value={barangay}
            onChangeText={setBarangay}
            maxLength={100}
          />

          <Text style={styles.formLabel}>City / Municipality *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Makati"
            placeholderTextColor={colors.textTertiary}
            value={city}
            onChangeText={setCity}
            maxLength={100}
          />

          <Text style={styles.formLabel}>Province *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Metro Manila"
            placeholderTextColor={colors.textTertiary}
            value={province}
            onChangeText={setProvince}
            maxLength={100}
          />

          <Text style={styles.formLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Gate code is 1234, use the side entrance"
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={styles.defaultToggle}
            onPress={() => setIsDefault((v) => !v)}
          >
            <View style={[styles.checkbox, isDefault && styles.checkboxChecked]}>
              {isDefault && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.defaultToggleText}>Set as default address</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.formFooter}>
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Button title={editingId ? 'Save Changes' : 'Add Address'} onPress={handleSave} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Addresses</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No Saved Addresses</Text>
          <Text style={styles.emptyText}>
            Add your home, work, or other frequently used addresses for quick booking.
          </Text>
          <Button title="Add Your First Address" onPress={() => setShowForm(true)} />
        </View>
      ) : (
        <>
          <FlatList
            data={addresses}
            keyExtractor={(item) => item.id}
            renderItem={renderAddress}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
          <View style={styles.addFooter}>
            {addresses.length < 10 ? (
              <Button title="Add Address" onPress={() => setShowForm(true)} />
            ) : (
              <Text style={styles.limitText}>Maximum of 10 addresses reached. Delete one to add a new address.</Text>
            )}
          </View>
        </>
      )}
      {/* Phase 14 R5-complete — ConfirmModal for delete-address */}
      <ConfirmModal
        visible={pendingDelete !== null}
        title="Delete Address"
        message={
          pendingDelete
            ? `Are you sure you want to delete "${pendingDelete.label} — ${pendingDelete.fullAddress}"?`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMut.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
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
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: { fontSize: 56, marginBottom: spacing.base },
  emptyTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  emptyText: {
    ...typography.body, color: colors.textSecondary,
    textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22,
  },
  listContent: { padding: spacing.base },
  addressCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  addressCardDefault: { borderColor: colors.primary },
  addressHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  addressIcon: { fontSize: 24, marginRight: spacing.base, marginTop: 2 },
  addressIconWrap: { marginRight: spacing.base, marginTop: 2, width: 28, alignItems: 'center' as const },
  addressInfo: { flex: 1 },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  addressLabel: { ...typography.body, fontWeight: '700', color: colors.text, marginRight: spacing.sm },
  defaultBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  defaultBadgeText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  addressText: { ...typography.body, color: colors.text, marginBottom: 2 },
  addressArea: { ...typography.caption, color: colors.textSecondary },
  addressNotes: { ...typography.caption, color: colors.textTertiary, fontStyle: 'italic', marginTop: 4 },
  addressActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  actionBtnDanger: { borderColor: colors.error },
  actionBtnTextDanger: { ...typography.caption, color: colors.error, fontWeight: '600' },
  addFooter: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  limitText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  formBody: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  formLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  labelGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  labelChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    gap: spacing.xs,
  },
  labelChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  labelChipIcon: { fontSize: 18 },
  labelChipIconWrap: { alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: spacing.xs },
  labelChipText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  labelChipTextActive: { color: colors.primary },
  input: {
    ...typography.body,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  defaultToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.base,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 13, fontWeight: '700' },
  defaultToggleText: { ...typography.body, color: colors.text },
  formFooter: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
