import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input } from '@/components/ui';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, setUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
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

  const menuItems = [
    { label: 'My Addresses', icon: '📍', onPress: () => {} },
    { label: 'Payment Methods', icon: '💳', onPress: () => {} },
    { label: 'Notification Settings', icon: '🔔', onPress: () => {} },
    { label: 'Help & Support', icon: '❓', onPress: () => {} },
    { label: 'Terms of Service', icon: '📄', onPress: () => {} },
    { label: 'Privacy Policy', icon: '🔒', onPress: () => {} },
  ];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + spacing.base }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        {editing ? (
          <View style={styles.editForm}>
            <Input
              label="First Name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <Input
              label="Last Name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
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
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.menuItem}
            onPress={item.onPress}
            activeOpacity={0.6}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button
        title="Log Out"
        onPress={handleLogout}
        variant="outline"
        style={styles.logoutButton}
      />

      <Text style={styles.version}>Version {platformConfig.appVersion}</Text>
    </ScrollView>
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
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 24 },
  userInfo: { flex: 1 },
  userName: { ...typography.h3, color: colors.text },
  userPhone: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  editButton: { marginTop: spacing.sm },
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
  },
  menuIcon: { fontSize: 20, marginRight: spacing.md, width: 28 },
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
