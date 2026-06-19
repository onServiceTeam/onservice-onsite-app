import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getMyInvites, acceptInvite, type PendingInvite } from '@/services/provider-staff.service';
import { getErrorMessage } from '@/utils/errors';
import { Routes } from '@/config/navigation';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';

export default function StaffInvitesScreen(): React.ReactElement {
  const router = useRouter();
  const applyStaffSession = useAuthStore((s) => s.applyStaffSession);

  const { data: invites, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['myInvites'],
    queryFn: getMyInvites,
    staleTime: 30 * 1000,
  });

  const accept = useMutation({
    mutationFn: (staffId: string) => acceptInvite(staffId),
    onSuccess: (tokens) => {
      // Swap in the provider_staff session, then route to the staff app.
      applyStaffSession(tokens.accessToken, tokens.refreshToken);
      router.replace(Routes.STAFF.JOBS);
    },
    onError: (e) => showToast(getErrorMessage(e, 'Could not accept the invitation. Please try again.'), 'error'),
  });

  function confirmAccept(invite: PendingInvite): void {
    Alert.alert(
      `Join ${invite.providerBusinessName}?`,
      `You'll join as ${invite.roleTitle || 'a team member'}. onService will review you before you can be assigned jobs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => accept.mutate(invite.staffId) },
      ],
    );
  }

  const list = invites ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Invitations</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {isError && (
          <ErrorState
            compact
            message="We couldn't load your invitations. Please check your connection and try again."
            onRetry={() => { void refetch(); }}
          />
        )}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="✉️"
            title="No invitations"
            description="If a provider invites you to their team, the invitation appears here."
          />
        )}

        {list.map((invite: PendingInvite) => (
          <View key={invite.staffId} style={styles.card}>
            <Text style={styles.provider}>{invite.providerBusinessName}</Text>
            <Text style={styles.role}>{invite.roleTitle || 'Team member'}</Text>
            <TouchableOpacity
              style={[styles.acceptBtn, accept.isPending && styles.btnDisabled]}
              onPress={() => confirmAccept(invite)}
              disabled={accept.isPending}
              activeOpacity={0.85}
            >
              {accept.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.acceptBtnText}>Accept invitation</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  errorBox: { backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },

  empty: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  provider: { ...typography.body, fontWeight: '700', color: colors.text },
  role: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  acceptBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  acceptBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
