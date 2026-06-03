import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyStaff, inviteStaff, removeStaff, staffStatusLabel,
  type ProviderStaffMember, type StaffStatus,
} from '@/services/provider-staff.service';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, Plus, Trash2, Star, Phone, Mail } from '@/components/icons';

const STATUS_COLOR: Record<StaffStatus, string> = {
  invited: colors.info,
  pending_review: colors.warning,
  approved: colors.secondary,
  rejected: colors.error,
  suspended: colors.error,
  deactivated: colors.textTertiary,
};

export default function ProviderTeamScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [roleTitle, setRoleTitle] = useState('');

  const { data: staff, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['providerStaff'],
    queryFn: getMyStaff,
    staleTime: 30 * 1000,
  });

  const invite = useMutation({
    mutationFn: () => inviteStaff({
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      roleTitle: roleTitle.trim() || undefined,
    }),
    onSuccess: () => {
      setPhone(''); setEmail(''); setRoleTitle('');
      void queryClient.invalidateQueries({ queryKey: ['providerStaff'] });
      Alert.alert('Invite sent', 'Your team member will be reviewed by onService before they can be assigned jobs.');
    },
    onError: (e) => Alert.alert('Could not invite', getErrorMessage(e, 'Please try again.')),
  });

  const remove = useMutation({
    mutationFn: (staffId: string) => removeStaff(staffId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['providerStaff'] }),
    onError: (e) => Alert.alert('Could not remove', getErrorMessage(e, 'Please try again.')),
  });

  function confirmRemove(m: ProviderStaffMember): void {
    Alert.alert(
      'Remove team member?',
      `${m.userName || m.roleTitle || 'This member'} will no longer be part of your team.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(m.id) },
      ],
    );
  }

  function submitInvite(): void {
    if (!phone.trim() && !email.trim()) {
      Alert.alert('Add a contact', 'Enter a phone number or email to invite a team member.');
      return;
    }
    invite.mutate();
  }

  const members = (staff ?? []).filter((m) => m.status !== 'deactivated');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Team</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={styles.intro}>
          Add the people who work with you. onService reviews each one before they can be
          assigned jobs. Their ratings count toward your account.
        </Text>

        {/* Invite form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite a team member</Text>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+63 9XX XXX XXXX"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>or Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.label}>Role (optional)</Text>
          <TextInput
            style={styles.input}
            value={roleTitle}
            onChangeText={setRoleTitle}
            placeholder="e.g. Aircon technician"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            style={[styles.inviteBtn, invite.isPending && styles.btnDisabled]}
            onPress={submitInvite}
            disabled={invite.isPending}
            activeOpacity={0.85}
          >
            {invite.isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Plus size={18} color={colors.white} style={{ marginRight: spacing.xs }} />
                <Text style={styles.inviteBtnText}>Send Invite</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Team members ({members.length})</Text>

        {isLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.base }} />}
        {isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Could not load your team. Pull down to refresh.</Text>
          </View>
        )}
        {!isLoading && !isError && members.length === 0 && (
          <Text style={styles.empty}>No team members yet. Invite someone above.</Text>
        )}

        {members.map((m) => (
          <View key={m.id} style={styles.memberCard}>
            <View style={styles.memberMain}>
              <View style={styles.memberHeader}>
                <Text style={styles.memberName}>{m.userName || m.roleTitle || 'Invited member'}</Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[m.status] + '22' }]}>
                  <Text style={[styles.statusPillText, { color: STATUS_COLOR[m.status] }]}>
                    {staffStatusLabel(m.status)}
                  </Text>
                </View>
              </View>
              {m.userName && m.roleTitle ? <Text style={styles.memberRole}>{m.roleTitle}</Text> : null}
              <View style={styles.memberMeta}>
                {m.invitePhone ? (
                  <View style={styles.metaItem}><Phone size={12} color={colors.textTertiary} /><Text style={styles.metaText}>{m.invitePhone}</Text></View>
                ) : null}
                {m.inviteEmail ? (
                  <View style={styles.metaItem}><Mail size={12} color={colors.textTertiary} /><Text style={styles.metaText}>{m.inviteEmail}</Text></View>
                ) : null}
                <View style={styles.metaItem}>
                  <Star size={12} color={colors.textTertiary} />
                  <Text style={styles.metaText}>{m.performance.averageRating.toFixed(1)} ({m.performance.totalReviews})</Text>
                </View>
              </View>
              {m.status === 'rejected' && m.adminDecisionReason ? (
                <Text style={styles.rejectReason}>Reason: {m.adminDecisionReason}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => confirmRemove(m)}
              style={styles.removeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={remove.isPending}
            >
              <Trash2 size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  intro: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.base },

  card: {
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md,
    padding: spacing.base, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body, color: colors.text,
    backgroundColor: colors.background,
  },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, marginTop: spacing.base,
  },
  btnDisabled: { opacity: 0.6 },
  inviteBtnText: { ...typography.body, fontWeight: '700', color: colors.white },

  sectionLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  empty: { ...typography.bodySmall, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.base },
  errorBox: { backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },

  memberCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  memberMain: { flex: 1 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  memberName: { ...typography.body, fontWeight: '600', color: colors.text },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  statusPillText: { ...typography.caption, fontWeight: '700' },
  memberRole: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  memberMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.caption, color: colors.textTertiary },
  rejectReason: { ...typography.caption, color: colors.error, marginTop: spacing.xs, fontStyle: 'italic' },
  removeBtn: { padding: spacing.xs, marginLeft: spacing.sm },
});
