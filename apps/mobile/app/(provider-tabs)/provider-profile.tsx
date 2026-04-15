import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getMyProfile, updateMyProfile } from '@/services/provider-api.service';
import { Badge, Button, Input } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const TIER_COLORS: Record<string, string> = {
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProviderProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['providerProfile'],
    queryFn: getMyProfile,
    staleTime: 60 * 1000,
  });

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [radius, setRadius] = useState('');

  const startEditing = () => {
    setBio(profile?.bio ?? '');
    setYearsExp(profile?.yearsExperience != null ? String(profile.yearsExperience) : '');
    setRadius(profile?.serviceRadiusKm != null ? String(profile.serviceRadiusKm) : '');
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: () => {
      const data: { bio?: string; yearsExperience?: number; serviceRadiusKm?: number } = {};
      if (bio.trim()) data.bio = bio.trim();
      const yrs = parseInt(yearsExp, 10);
      if (!isNaN(yrs) && yrs >= 0) data.yearsExperience = yrs;
      const rad = parseInt(radius, 10);
      if (!isNaN(rad) && rad > 0) data.serviceRadiusKm = rad;
      return updateMyProfile(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to update profile.');
    },
  });

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
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
          <Badge
            label={profile.tier.toUpperCase()}
            backgroundColor={TIER_COLORS[profile.tier] ?? colors.textTertiary}
            size="md"
          />
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
              {profile.rating != null ? `⭐ ${profile.rating.toFixed(1)}` : 'New'}
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
            style={{ height: 100, textAlignVertical: 'top' }}
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
            <TouchableOpacity onPress={() => router.push('/provider/schedule' as never)}>
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
            <TouchableOpacity onPress={() => router.push('/provider/services' as never)}>
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
                  <Text style={styles.servicePrice}>₱{(svc.basePrice / 100).toFixed(0)}</Text>
                )}
              </View>
            ))
          )}
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/provider/schedule' as never)}>
          <Text style={styles.menuIcon}>📅</Text>
          <Text style={styles.menuLabel}>Manage Schedule</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/provider/services' as never)}>
          <Text style={styles.menuIcon}>🛠</Text>
          <Text style={styles.menuLabel}>Manage Services</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/provider/reviews' as never)}>
          <Text style={styles.menuIcon}>⭐</Text>
          <Text style={styles.menuLabel}>My Reviews</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/provider/payouts' as never)}>
          <Text style={styles.menuIcon}>💸</Text>
          <Text style={styles.menuLabel}>Payout History</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/provider/notifications' as never)}>
          <Text style={styles.menuIcon}>🔔</Text>
          <Text style={styles.menuLabel}>Notifications</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/provider/settings' as never)}>
          <Text style={styles.menuIcon}>⚙️</Text>
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
  avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 32 },
  userName: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  userPhone: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },

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
  menuLabel: { ...typography.body, color: colors.text, flex: 1 },
  menuArrow: { fontSize: 22, color: colors.textTertiary },

  logoutButton: { marginTop: spacing.md, borderColor: colors.error },

  bottomSpacer: { height: 40 },
});
