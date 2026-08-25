import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyStaff, inviteStaff, removeStaff, submitStaffForReview, staffStatusLabel,
  type ProviderStaffMember, type StaffStatus,
} from '@/services/provider-staff.service';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, Plus, Trash2, Star, Phone, Mail, Users, ClipboardList } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { useResponsive } from '@/hooks/useResponsive';
import { getProviderBookings } from '@/services/provider-api.service';
import type { Booking } from '@/services/booking.service';
import { formatRelative } from '@/utils/date';
import { Routes } from '@/config/navigation';

const PH_MOBILE_E164 = /^\+639\d{9}$/;
const BASIC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTeamInvitePhone(raw: string): string {
  const compact = raw.trim().replace(/[\s().-]+/g, '');
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^639\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
}

export function validateTeamInvite(phone: string, email: string, roleTitle: string): string | null {
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim();
  if (!trimmedPhone && !trimmedEmail) return 'Enter a phone number or email to invite a team member.';
  if (trimmedPhone && !PH_MOBILE_E164.test(normalizeTeamInvitePhone(trimmedPhone))) {
    return 'Enter a valid PH mobile number, such as +63 917 123 4567.';
  }
  if (trimmedEmail && (trimmedEmail.length > 254 || !BASIC_EMAIL.test(trimmedEmail))) {
    return 'Enter a valid email address.';
  }
  if (roleTitle.trim().length > 100) return 'Role must be 100 characters or less.';
  return null;
}

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
  const { isPhone } = useResponsive();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [roleTitle, setRoleTitle] = useState('');

  const { data: staff, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['providerStaff'],
    queryFn: getMyStaff,
    staleTime: 30 * 1000,
  });

  const members = (staff ?? []).filter((m) => m.status !== 'deactivated');
  const hasAssignableMember = members.some((member) => member.isAssignable);
  const assignmentsQuery = useQuery({
    queryKey: ['providerJobs', 'active', 'team-assignments'],
    queryFn: () => getProviderBookings('active', 1, 50),
    enabled: hasAssignableMember,
    staleTime: 30 * 1000,
  });

  const invite = useMutation({
    mutationFn: inviteStaff,
    onSuccess: () => {
      setPhone(''); setEmail(''); setRoleTitle('');
      void queryClient.invalidateQueries({ queryKey: ['providerStaff'] });
      showToast(
        'Invitation created. Ask them to sign in with that phone or email and open Team Invitations. onService reviews them before job assignment.',
        'success',
      );
    },
    onError: (e) => showToast(getErrorMessage(e, 'Could not send invite. Please try again.'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (staffId: string) => removeStaff(staffId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['providerStaff'] }),
    onError: (e) => showToast(getErrorMessage(e, 'Could not remove team member. Please try again.'), 'error'),
  });

  const submit = useMutation({
    mutationFn: (staffId: string) => submitStaffForReview(staffId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerStaff'] });
      showToast('Sent for review. This team member will be reviewed before they can be assigned jobs.', 'success');
    },
    onError: (e) => showToast(getErrorMessage(e, 'Could not submit for review. Please try again.'), 'error'),
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
    const validationError = validateTeamInvite(phone, email, roleTitle);
    if (validationError) {
      showToast(validationError, 'warning');
      return;
    }
    invite.mutate({
      phone: phone.trim() ? normalizeTeamInvitePhone(phone) : undefined,
      email: email.trim() ? email.trim().toLowerCase() : undefined,
      roleTitle: roleTitle.trim() || undefined,
    });
  }

  const activeAssignments = (assignmentsQuery.data?.bookings ?? []).filter(
    (booking) => booking.performerStaffId,
  );
  const memberById = new Map(members.map((member) => [member.id, member]));

  function assignmentMember(booking: Booking): ProviderStaffMember | undefined {
    return booking.performerStaffId ? memberById.get(booking.performerStaffId) : undefined;
  }

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
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        refreshControl={<RefreshControl refreshing={isRefetching || assignmentsQuery.isRefetching} onRefresh={() => { void refetch(); if (hasAssignableMember) void assignmentsQuery.refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={styles.intro}>
          Add the people who work with you. onService reviews each one before they can be
          assigned jobs. Their ratings count toward your account.
        </Text>

        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Team management' : 'Tablet and desktop team management workspace'}
        >
        {/* Invite form */}
        <View style={styles.inviteColumn}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite a team member</Text>
          <Text style={styles.cardHint}>Use a PH mobile number, an email address, or both.</Text>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+63 9XX XXX XXXX"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={30}
            accessibilityLabel="Team member phone number"
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
            autoComplete="email"
            maxLength={254}
            accessibilityLabel="Team member email address"
          />
          <Text style={styles.label}>Role (optional)</Text>
          <TextInput
            style={styles.input}
            value={roleTitle}
            onChangeText={setRoleTitle}
            placeholder="e.g. Aircon technician"
            placeholderTextColor={colors.textTertiary}
            maxLength={100}
            accessibilityLabel="Team member role"
          />
          <TouchableOpacity
            style={[styles.inviteBtn, invite.isPending && styles.btnDisabled]}
            onPress={submitInvite}
            disabled={invite.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send team invitation"
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
        </View>

        <View style={styles.membersColumn}>
        <Text style={styles.sectionLabel}>Team members ({members.length})</Text>

        {isLoading && (
          <View style={{ marginTop: spacing.base }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
        {isError && (
          <ErrorState
            compact
            message="We couldn't load your team. Pull down to refresh."
            onRetry={() => void refetch()}
          />
        )}
        {!isLoading && !isError && members.length === 0 && (
          <EmptyState
            icon={<Users size={48} color={colors.textTertiary} />}
            title="No team members yet"
            description="Invite someone above to add them to your team."
          />
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
            <View style={styles.memberActions}>
              {(m.status === 'invited' || m.status === 'rejected') && (
                <TouchableOpacity
                  onPress={() => submit.mutate(m.id)}
                  style={styles.submitBtn}
                  disabled={submit.isPending}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Submit ${m.userName || m.roleTitle || 'team member'} for review`}
                >
                  <Text style={styles.submitBtnText}>Submit for review</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => confirmRemove(m)}
                style={styles.removeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={remove.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${m.userName || m.roleTitle || 'team member'}`}
              >
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.assignmentsHeader}>
          <View style={styles.assignmentsHeaderCopy}>
            <Text style={styles.sectionLabel}>Active assignments</Text>
            <Text style={styles.assignmentHint}>Assign approved team members from each job record.</Text>
          </View>
          <TouchableOpacity
            style={styles.openJobsButton}
            onPress={() => router.push(Routes.PROVIDER_TABS.JOBS)}
            accessibilityRole="button"
            accessibilityLabel="Open provider jobs to manage assignments"
          >
            <Text style={styles.openJobsText}>Open Jobs</Text>
          </TouchableOpacity>
        </View>

        {hasAssignableMember && assignmentsQuery.isLoading ? (
          <SkeletonCard />
        ) : assignmentsQuery.isError ? (
          <ErrorState
            compact
            message="We couldn't load active team assignments."
            onRetry={() => void assignmentsQuery.refetch()}
          />
        ) : activeAssignments.length === 0 ? (
          <View style={styles.assignmentEmpty}>
            <ClipboardList size={32} color={colors.textTertiary} />
            <Text style={styles.assignmentEmptyTitle}>No active team assignments</Text>
            <Text style={styles.assignmentEmptyText}>Jobs performed by you remain in Jobs and are not listed here.</Text>
          </View>
        ) : (
          activeAssignments.map((booking) => {
            const member = assignmentMember(booking);
            return (
              <TouchableOpacity
                key={booking.id}
                style={styles.assignmentCard}
                onPress={() => router.push(`/provider/job/${booking.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`View ${booking.serviceName ?? booking.categoryName ?? 'service'} assignment`}
              >
                <View style={styles.assignmentTopRow}>
                  <Text style={styles.assignmentService}>{booking.serviceName ?? booking.categoryName ?? 'Service job'}</Text>
                  <Text style={styles.assignmentTime}>{formatRelative(booking.scheduledAt)}</Text>
                </View>
                <Text style={styles.assignmentMember}>Assigned to {member?.userName || member?.roleTitle || 'approved team member'}</Text>
                <Text style={styles.assignmentAddress} numberOfLines={2}>{[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}</Text>
                <Text style={styles.assignmentView}>View job details</Text>
              </TouchableOpacity>
            );
          })
        )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  intro: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.base },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  inviteColumn: { flex: 1, minWidth: 280 },
  membersColumn: { flex: 1.35, minWidth: 320 },

  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  cardHint: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body, color: colors.text,
    backgroundColor: colors.surfaceMuted,
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
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
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
  memberActions: { alignItems: 'flex-end', marginLeft: spacing.sm, gap: spacing.xs },
  submitBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm, backgroundColor: colors.primaryLight,
  },
  submitBtnText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  removeBtn: { padding: spacing.xs },
  assignmentsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  assignmentsHeaderCopy: { flex: 1, minWidth: 0 },
  assignmentHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  openJobsButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  openJobsText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  assignmentEmpty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  assignmentEmptyTitle: { ...typography.body, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  assignmentEmptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  assignmentCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  assignmentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  assignmentService: { ...typography.body, color: colors.text, fontWeight: '700', flex: 1 },
  assignmentTime: { ...typography.caption, color: colors.warning },
  assignmentMember: { ...typography.bodySmall, color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
  assignmentAddress: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  assignmentView: { ...typography.bodySmall, color: colors.secondary, fontWeight: '700', marginTop: spacing.md },
});
