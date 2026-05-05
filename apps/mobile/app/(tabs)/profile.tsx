import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore, type User } from '@/stores/auth.store';
import { Button, Input } from '@/components/ui';
import api from '@/services/api';
import type { ApiResponse } from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 R5-complete — Avatar + PhoneInput cross-cutting components.
import Avatar from '@/components/Avatar';
import PhoneInput from '@/components/PhoneInput';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import { MapPin, CreditCard, Bell, HelpCircle, FileText, KeyRound } from '@/components/icons';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

export default function ProfileScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, setUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get<ApiResponse<User>>('/api/v1/auth/me');
      const data = res.data.data;
      if (data) {
        setUser(data);
        setFirstName(data.firstName ?? '');
        setLastName(data.lastName ?? '');
      }
    } catch {
      // Silently fail on refresh
    } finally {
      setRefreshing(false);
    }
  }, [setUser]);

  const handleLogout = (): void => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace(Routes.AUTH.LOGIN);
        },
      },
    ]);
  };

  const handleSaveProfile = async (): Promise<void> => {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      Alert.alert('Invalid', 'Names must be at least 2 characters.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<{ success: boolean; data: typeof user }>('/api/v1/auth/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (res.data.data && user) {
        setUser({ ...user, firstName: firstName.trim(), lastName: lastName.trim() });
      }
      setEditing(false);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Bug 920 — Phase 14 D04 SiguradoShield pull. The first menu row used to be
  // "SiguradoShield™ Protection" linking to /customer/safety. Removed entirely.
  // Safety affordances now live at /customer/safety-and-support and are
  // surfaced via Help & Support → Report a safety concern. Do NOT reintroduce
  // a SiguradoShield menu row without lifting LAUNCH-LIMITATIONS §23.
  const menuItems: Array<{ label: string; icon: IconComponent; onPress: () => void }> = [
    { label: 'My Addresses', icon: MapPin, onPress: () => router.push(Routes.CUSTOMER.ADDRESSES) },
    { label: 'Payment Methods', icon: CreditCard, onPress: () => router.push(Routes.CUSTOMER.PAYMENT_METHODS) },
    { label: 'Notification Settings', icon: Bell, onPress: () => router.push(Routes.CUSTOMER.SETTINGS) },
    { label: 'Help & Support', icon: HelpCircle, onPress: () => router.push(Routes.CUSTOMER.HELP) },
    { label: 'Terms & Privacy', icon: FileText, onPress: () => router.push(Routes.CUSTOMER.TERMS) },
    { label: 'Account & Data', icon: KeyRound, onPress: () => router.push(Routes.CUSTOMER.ACCOUNT_MANAGEMENT) },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + spacing.base }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.userCard}>
        {/* Phase 14 R5-complete — Avatar with initials fallback */}
        <Avatar
          name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || undefined}
          size={64}
        />
        {editing ? (
          /* BUG-PHASE147-01 fix — pre-fix First/Last Name inputs
             had no maxLength. Server caps both at max(100)
             (auth.validators.ts:76-77). Same fix shape as Phase
             145/146. */
          <View style={styles.editForm}>
            <Input
              label="First Name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              maxLength={100}
            />
            <Input
              label="Last Name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              maxLength={100}
            />
            {/* Phase 14 R5-complete — PhoneInput (read-only display via value prop;
                actual phone change requires OTP re-verification — separate flow). */}
            <PhoneInput
              value={user?.phone ?? ''}
              onChange={() => {
                Alert.alert(
                  'Change Phone',
                  'Phone number changes require OTP re-verification. This feature is in development.',
                );
              }}
              label="Mobile Number"
              testID="profile-phone-input"
            />
            <View style={styles.editActions}>
              <Button title="Save" onPress={handleSaveProfile} loading={saving} size="sm" />
              <Button
                title="Cancel"
                onPress={() => {
                  setEditing(false);
                  setFirstName(user?.firstName ?? '');
                  setLastName(user?.lastName ?? '');
                }}
                variant="ghost"
                size="sm"
              />
            </View>
          </View>
        ) : (
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {user?.firstName ?? ''} {user?.lastName ?? ''}
            </Text>
            <Text style={styles.userPhone}>{user?.phone ?? ''}</Text>
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.editButton}>
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.menu}>
        {menuItems.map((item) => {
          const ItemIcon = item.icon;
          return (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.6}
            >
              <View style={styles.menuIconWrap}><ItemIcon size={20} color={colors.text} /></View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button
        title="Log Out"
        onPress={handleLogout}
        variant="outline"
        style={styles.logoutButton}
      />

      <Text style={styles.version}>Version {platformConfig.appVersion}</Text>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.base },
  content: { paddingBottom: 100 },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  userCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 24 },
  userInfo: { flex: 1 },
  userName: { ...typography.h3, color: colors.text },
  userPhone: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  editButton: { marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' as const },
  editButtonText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  editForm: { flex: 1 },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  menu: { marginBottom: spacing.lg },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 44,
  },
  menuIcon: { fontSize: 20, marginRight: spacing.md, width: 28 },
  menuIconWrap: { marginRight: spacing.md, width: 28, alignItems: 'center' as const },
  menuLabel: { ...typography.body, color: colors.text, flex: 1 },
  menuArrow: { fontSize: 22, color: colors.textTertiary },
  logoutButton: { marginBottom: spacing.base },
  version: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
