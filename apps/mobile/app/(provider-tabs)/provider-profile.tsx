import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getMyProfile, updateMyProfile } from '@/services/provider-api.service';
import { Badge, Button, Input } from '@/components/ui';
import {
  AlertTriangle,
  Calendar,
  Wrench,
  Camera,
  Award,
  Star,
  Banknote,
  Bell,
  Settings,
} from '@/components/icons';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

import { Routes } from '@/config/navigation';
// BUG-PHASE94-01 — founding tier added; badge falls back to raw
// uppercase string ("FOUNDING") which is fine for this screen, but
// the color must match the rest of the app.
const TIER_COLORS: Record<string, string> = {
  founding: colors.tierFounding,
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProviderProfileScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['providerProfile'],
    queryFn: getMyProfile,
    staleTime: 60 * 1000,
  });

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [radius, setRadius] = useState('');

  const startEditing = (): void => {
    setBio(profile?.bio ?? '');
    setYearsExp(profile?.yearsExperience != null ? String(profile.yearsExperience) : '');
    setRadius(profile?.serviceRadiusKm != null ? String(profile.serviceRadiusKm) : '');
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: () => {
      const data: { bio?: string; yearsExperience?: number; serviceRadiusKm?: number } = {};
      if (bio.trim()) data.bio = bio.trim();
      // Phase K MED-K10 fix — client-side bounds match the backend
      // Zod validators (provider.validators.ts: yearsExperience
      // 0..60, serviceRadiusKm 1..50). Pre-fix the form accepted
      // any positive integer and pushed it to the server which
      // returned a 400 with a Zod error the user couldn't easily
      // map back to the field. Now we throw a friendly local
      // Alert before the network round-trip.
      const yrs = parseInt(yearsExp, 10);
      if (!isNaN(yrs)) {
        if (yrs < 0 || yrs > 60) {
          throw new Error('Years of experience must be between 0 and 60.');
        }
        data.yearsExperience = yrs;
      }
      const rad = parseInt(radius, 10);
      if (!isNaN(rad)) {
        if (rad < 1 || rad > 50) {
          throw new Error('Service radius must be between 1 and 50 km.');
        }
        data.serviceRadiusKm = rad;
      }
      return updateMyProfile(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      Alert.alert('Error', getErrorMessage(err, 'Failed to update profile.'));
    },
  });

  const handleLogout = (): void => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: (): void => {
          logout();
          router.replace(Routes.AUTH.LOGIN);
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.errorCenter, { paddingTop: insets.top + 80 }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (isError && !profile) {
    return (
      <View style={[styles.container, styles.errorCenter, { paddingTop: insets.top + 80 }]}>
        <AlertTriangle size={48} color={colors.error} style={styles.errorIcon} />
        <Text style={styles.title}>Could not load profile</Text>
        <TouchableOpacity onPress={() => void refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + spacing.base }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.userName}>
          {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Provider'}
        </Text>
        <Text style={styles.userPhone}>{user?.phone}</Text>
        {profile && (
          <TouchableOpacity onPress={(): void => { router.push(Routes.PROVIDER.TIER_PROGRESSION); }}>
            <Badge
              label={profile.tier.toUpperCase()}
              backgroundColor={TIER_COLORS[profile.tier] ?? colors.textTertiary}
              size="md"
            />
            <Text style={styles.tierProgressLink}>View Tier Progress →</Text>
          </TouchableOpacity>
        )}
      </View>

      {profile && !editing && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>About</Text>
            <TouchableOpacity onPress={startEditing}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.bioText}>{profile.bio || 'No bio set. Tap Edit to add one.'}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Experience</Text>
            <Text style={styles.detailValue}>
              {profile.yearsExperience != null ? `${profile.yearsExperience} years` : '—'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Service Radius</Text>
            <Text style={styles.detailValue}>
              {profile.serviceRadiusKm != null ? `${profile.serviceRadiusKm} km` : '—'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Rating</Text>
            <Text style={styles.detailValue}>
              {profile.rating != null ? profile.rating.toFixed(1) : 'New'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Jobs</Text>
            <Text style={styles.detailValue}>{profile.totalJobs}</Text>
          </View>
        </View>
      )}

      {editing && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Edit Profile</Text>
          <Input
            label="Bio"
            placeholder="Tell customers about yourself..."
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            style={styles.bioInput}
          />
          <Input
            label="Years of Experience"
            placeholder="e.g. 5"
            value={yearsExp}
            onChangeText={setYearsExp}
            keyboardType="number-pad"
          />
          <Input
            label="Service Radius (km)"
            placeholder="e.g. 15"
            value={radius}
            onChangeText={setRadius}
            keyboardType="number-pad"
          />
          <View style={styles.editActions}>
            <Button
              title="Save"
              onPress={() => updateMutation.mutate()}
              loading={updateMutation.isPending}
            />
            <Button
              title="Cancel"
              onPress={() => setEditing(false)}
              variant="outline"
              disabled={updateMutation.isPending}
            />
          </View>
        </View>
      )}

      {profile && profile.schedule.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <TouchableOpacity onPress={() => router.push(Routes.PROVIDER.SCHEDULE)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.scheduleGrid}>
            {profile.schedule
              .filter((s) => s.isAvailable)
              .map((slot) => (
                <View key={slot.id} style={styles.scheduleItem}>
                  <Text style={styles.scheduleDay}>{DAY_NAMES[slot.dayOfWeek]}</Text>
                  <Text style={styles.scheduleTime}>{slot.startTime} – {slot.endTime}</Text>
                </View>
              ))}
            {profile.schedule.filter((s) => s.isAvailable).length === 0 && (
              <Text style={styles.noSchedule}>No schedule set. Tap Edit to configure.</Text>
            )}
          </View>
        </View>
      )}

      {profile && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Services ({profile.services.length})</Text>
            <TouchableOpacity onPress={() => router.push(Routes.PROVIDER.SERVICES)}>
              <Text style={styles.editText}>Manage</Text>
            </TouchableOpacity>
          </View>
          {profile.services.length === 0 ? (
            <Text style={styles.noSchedule}>No services added yet. Tap Manage to add.</Text>
          ) : (
            profile.services.map((svc) => (
              <View key={svc.id} style={styles.serviceRow}>
                <Text style={styles.serviceName}>{svc.subcategoryName}</Text>
                {svc.basePrice != null && (
                  <Text style={styles.servicePrice}>{formatPHP(svc.basePrice)}</Text>
                )}
              </View>
            ))
          )}
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push(Routes.PROVIDER.SCHEDULE)}>
          <Calendar size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Manage Schedule</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push(Routes.PROVIDER.SERVICES)}>
          <Wrench size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Manage Services</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={(): void => { router.push(Routes.PROVIDER.PORTFOLIO); }}>
          <Camera size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Portfolio Photos</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={(): void => { router.push(Routes.PROVIDER.CERTIFICATIONS); }}>
          <Award size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Certifications</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push(Routes.PROVIDER.REVIEWS)}>
          <Star size={22} color={colors.warning} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>My Reviews</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push(Routes.PROVIDER.PAYOUTS)}>
          <Banknote size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Payout History</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push(Routes.PROVIDER.NOTIFICATIONS)}>
          <Bell size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Notifications</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push(Routes.PROVIDER.SETTINGS)}>
          <Settings size={22} color={colors.primary} style={styles.menuIconImg} />
          <Text style={styles.menuLabel}>Settings</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <Button
        title="Log Out"
        onPress={handleLogout}
        variant="outline"
        style={styles.logoutButton}
      />

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.base },
  errorCenter: { alignItems: 'center' },
  errorEmoji: { fontSize: 40, marginBottom: spacing.base },
  errorIcon: { marginBottom: spacing.base },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
  scrollContent: { paddingBottom: 20 },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },

  profileCard: { alignItems: 'center', marginBottom: spacing.xl },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 32 },
  userName: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  userPhone: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  tierProgressLink: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: spacing.xs, textAlign: 'center' },

  section: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  editText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600' },

  bioText: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailLabel: { ...typography.body, color: colors.textSecondary },
  detailValue: { ...typography.body, color: colors.text, fontWeight: '600' },

  editActions: { gap: spacing.sm, marginTop: spacing.md },

  scheduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  scheduleItem: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  scheduleDay: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  scheduleTime: { ...typography.caption, color: colors.textSecondary },
  noSchedule: { ...typography.body, color: colors.textTertiary, fontStyle: 'italic' },

  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  serviceName: { ...typography.body, color: colors.text, flex: 1 },
  servicePrice: { ...typography.body, color: colors.secondary, fontWeight: '600' },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuIcon: { fontSize: 20, marginRight: spacing.md },
  menuIconImg: { marginRight: spacing.md },
  menuLabel: { ...typography.body, color: colors.text, flex: 1 },
  menuArrow: { fontSize: 22, color: colors.textTertiary },

  logoutButton: { marginTop: spacing.md, borderColor: colors.error },

  bioInput: { height: 100, textAlignVertical: 'top' } as const,
  bottomSpacer: { height: 40 },
});
