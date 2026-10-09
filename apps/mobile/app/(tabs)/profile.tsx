import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore, type User } from '@/stores/auth.store';
import { Button, Input } from '@/components/ui';
import ConfirmModal from '@/components/ConfirmModal';
import { showToast } from '@/lib/toast';
import api from '@/services/api';
import type { ApiResponse } from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 R5-complete — shared Avatar with initials fallback.
import Avatar from '@/components/Avatar';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import {
  MapPin,
  CreditCard,
  Bell,
  HelpCircle,
  FileText,
  KeyRound,
  UserCheck,
  ChevronRight,
  Scale,
  Building2,
} from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

export default function ProfileScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isTablet, isDesktop } = useResponsive();
  const isWide = isTablet || isDesktop;
  const { user, logout, setUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
    setLogoutVisible(true);
  };

  const confirmLogout = async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace(Routes.AUTH.LOGIN);
    } finally {
      setLoggingOut(false);
      setLogoutVisible(false);
    }
  };

  const handleSaveProfile = async (): Promise<void> => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    if (
      normalizedFirstName === (user?.firstName ?? '').trim()
      && normalizedLastName === (user?.lastName ?? '').trim()
    ) {
      setEditing(false);
      showToast('No profile changes to save.', 'info');
      return;
    }
    if (normalizedFirstName.length < 2 || normalizedLastName.length < 2) {
      showToast('First and last names must each be at least 2 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<{ success: boolean; data: typeof user }>('/api/v1/auth/me', {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
      });
      if (res.data.data && user) {
        setUser({ ...user, firstName: normalizedFirstName, lastName: normalizedLastName });
      }
      setEditing(false);
      showToast('Profile updated.', 'success');
    } catch {
      showToast('Failed to update profile. Please try again.', 'error');
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
    {
      label: 'Company Workspaces',
      icon: Building2,
      onPress: () => router.push(Routes.CUSTOMER.BUSINESS_ACCOUNTS),
    },
    { label: 'My Addresses', icon: MapPin, onPress: () => router.push(Routes.CUSTOMER.ADDRESSES) },
    {
      label: 'Payment Methods',
      icon: CreditCard,
      onPress: () => router.push(Routes.CUSTOMER.PAYMENT_METHODS),
    },
    {
      label: 'Notification Settings',
      icon: Bell,
      onPress: () => router.push(Routes.CUSTOMER.SETTINGS),
    },
    {
      label: 'My Disputes',
      icon: Scale,
      onPress: () => router.push(Routes.CUSTOMER.DISPUTES),
    },
    {
      // D23 + Bug UX-089 — an invite is matched to an existing customer
      // account before accepting it changes that account to provider_staff.
      // Keep this discovery link in the customer profile so acceptance is not
      // a circular, direct-URL-only flow.
      label: 'Team Invitations',
      icon: UserCheck,
      onPress: () => router.push(Routes.STAFF.INVITES),
    },
    { label: 'Help & Support', icon: HelpCircle, onPress: () => router.push(Routes.CUSTOMER.HELP) },
    { label: 'Terms & Privacy', icon: FileText, onPress: () => router.push(Routes.CUSTOMER.TERMS) },
    {
      label: 'Account & Data',
      icon: KeyRound,
      onPress: () => router.push(Routes.CUSTOMER.ACCOUNT_MANAGEMENT),
    },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + spacing.base }]}
        contentContainerStyle={[styles.content, isWide && styles.wideContent]}
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

        <View
          style={[styles.profileWorkspace, isWide && styles.profileWorkspaceWide]}
          accessibilityLabel={isWide ? 'Wide customer profile workspace' : 'Customer profile workspace'}
        >
        <View style={[styles.identityColumn, isWide && styles.identityColumnWide]}>
        <View style={styles.userCard} accessibilityLabel="Customer identity and contact details">
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
              <View style={styles.phoneRecord} accessibilityLabel="Verified mobile number">
                <Text style={styles.phoneRecordLabel}>Mobile Number</Text>
                <Text style={styles.phoneRecordValue}>{user?.phone ?? 'Not available'}</Text>
                <Text style={styles.phoneRecordHint}>
                  Phone changes are not available on this screen because the number protects account access.
                </Text>
                <TouchableOpacity
                  style={styles.phoneSupportLink}
                  onPress={() => router.push({
                    pathname: Routes.SUPPORT.NEW,
                    params: {
                      type: 'account_issue',
                      subject: 'Change my account phone number',
                      description: 'I need help changing the verified phone number on my account.',
                    },
                  })}
                  accessibilityRole="button"
                  accessibilityLabel="Contact support about changing the verified phone number"
                >
                  <Text style={styles.phoneSupportText}>Contact account support</Text>
                </TouchableOpacity>
              </View>
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
              <TouchableOpacity
                onPress={() => setEditing(true)}
                style={styles.editButton}
                accessibilityRole="button"
                accessibilityLabel="Edit customer profile"
              >
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isWide && (
          <View style={styles.securityNote} accessibilityLabel="Account phone security note">
            <Text style={styles.securityNoteTitle}>Account access</Text>
            <Text style={styles.securityNoteText}>
              Your verified mobile number is used to protect sign-in. Account and data tools are available in the settings panel.
            </Text>
          </View>
        )}

        {isWide && (
          <Button
            title="Log Out"
            onPress={handleLogout}
            variant="outline"
            style={styles.logoutButton}
          />
        )}
        {isWide && <Text style={styles.version}>Version {platformConfig.appVersion}</Text>}
        </View>

        <View style={[styles.settingsColumn, isWide && styles.settingsColumnWide]}>
        {isWide && <Text style={styles.sectionTitle}>Account settings</Text>}
        <View style={[styles.menu, isDesktop && styles.desktopMenu]} accessibilityLabel="Customer account settings">
          {menuItems.map((item) => {
            const ItemIcon = item.icon;
            return (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuItem, isDesktop && styles.desktopMenuItem]}
                onPress={item.onPress}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.menuIconWrap}>
                  <ItemIcon size={20} color={colors.primary} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <ChevronRight size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>
        </View>
        </View>

        {!isWide && (
          <Button
            title="Log Out"
            onPress={handleLogout}
            variant="outline"
            style={styles.logoutButton}
          />
        )}

        {!isWide && <Text style={styles.version}>Version {platformConfig.appVersion}</Text>}
      </ScrollView>
      <ConfirmModal
        visible={logoutVisible}
        title="Log out?"
        message="You will need your verified mobile number to sign in again."
        confirmLabel="Log Out"
        destructive
        loading={loggingOut}
        onConfirm={() => void confirmLogout()}
        onCancel={() => setLogoutVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.base },
  content: { paddingBottom: 100 },
  wideContent: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  profileWorkspace: { width: '100%' },
  profileWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  identityColumn: { width: '100%' },
  identityColumnWide: { width: 360 },
  settingsColumn: { width: '100%' },
  settingsColumnWide: { flex: 1, minWidth: 0 },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  userCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  phoneRecord: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  phoneRecordLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  phoneRecordValue: { ...typography.body, color: colors.text, fontWeight: '700' },
  phoneRecordHint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.xs },
  phoneSupportLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  phoneSupportText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  securityNote: {
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.base,
  },
  securityNoteTitle: { ...typography.body, color: colors.primary, fontWeight: '700', marginBottom: spacing.xs },
  securityNoteText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  menu: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 44,
  },
  desktopMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
  },
  desktopMenuItem: {
    width: '50%',
    paddingHorizontal: spacing.sm,
  },
  menuIcon: { fontSize: 20, marginRight: spacing.md, width: 28 },
  menuIconWrap: {
    marginRight: spacing.md,
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
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
