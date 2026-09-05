import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui';
import { ClipboardList } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuthStore } from '@/stores/auth.store';
import { useApplicationSession } from '@/stores/provider-application-session.store';
import { getApplicationStatus, type ProviderApplicationStatus } from '@/services/provider-api.service';
import api, { refreshAuthSession } from '@/services/api';

const approvedUserEnvelope = z.object({ success: z.literal(true), data: z.object({
  id: z.string().uuid(), role: z.literal('provider'), phone: z.string().min(1),
  email: z.string().nullable(), firstName: z.string().nullable(), lastName: z.string().nullable(), avatarUrl: z.string().nullable(),
}) });
const statusCopy: Record<ProviderApplicationStatus['status'], { title: string; body: string }> = {
  pending: { title: 'Application submitted', body: 'Your application is waiting for a decision. We cannot yet confirm whether the review has started.' },
  approved: { title: 'Application approved', body: 'Your application has been approved. You can open your provider workspace once your account access is confirmed.' },
  rejected: { title: 'Application not approved', body: 'Your application was declined. Read the reason below, or contact support if you need clarification.' },
  suspended: { title: 'Provider access suspended', body: 'Provider access is suspended. This is not a new application rejection. Contact support to discuss the restriction.' },
  deactivated: { title: 'Provider account deactivated', body: 'This provider account is deactivated. Contact support about its status; submitting another application does not restore access.' },
};

/** Both review URLs describe the same canonical provider record, not two review processes. */
export function ProviderApplicationStatusScreen({ routeName }: {
  routeName: 'review-pending' | 'background-check-status';
}): React.ReactElement {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const auth = useAuthStore();
  const session = useApplicationSession();
  const ownerId = auth.user?.id ?? null;
  const generation = session.generation;
  const routeEpoch = session.routeEpoch;
  const screenActive = session.activeRoute === null || session.activeRoute === routeName;
  const eligible = auth.isAuthenticated && auth.user?.role === 'customer' && ownerId !== null;
  const { isPhone } = useResponsive();
  const mounted = useRef(true);
  const attemptedScope = useRef<string | null>(null);
  const activeFlight = useRef<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const scope = `${ownerId}:${generation}:${routeEpoch}`;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setActivating(false); setActivationError(null); }, [scope]);
  const current = useCallback((): boolean => {
    const now = useAuthStore.getState();
    const applicant = useApplicationSession.getState();
    return mounted.current && screenActive && now.isAuthenticated && now.user?.id === ownerId && now.user.role === 'customer'
      && applicant.generation === generation && applicant.routeEpoch === routeEpoch
      && (applicant.activeRoute === null || applicant.activeRoute === routeName);
  }, [ownerId, generation, routeEpoch, routeName, screenActive]);

  const query = useQuery({
    queryKey: ['providerOnboardingStatus', ownerId, generation],
    queryFn: getApplicationStatus,
    enabled: eligible && screenActive,
    refetchInterval: 15_000, staleTime: 0, gcTime: 0, retry: false,
  });
  const observation = useRef(query);
  observation.current = query;

  const activate = useCallback(async (): Promise<void> => {
    const latest = observation.current;
    if (!current() || activeFlight.current === scope || latest.data?.status !== 'approved' || latest.isError || latest.isFetching) return;
    activeFlight.current = scope;
    setActivating(true);
    setActivationError(null);
    try {
      const refreshed = await refreshAuthSession();
      if (!current()) return;
      if (!refreshed) throw new Error('The approved session could not be refreshed.');
      const response = await api.get<unknown>('/api/v1/auth/me');
      if (!current()) return;
      const result = approvedUserEnvelope.safeParse(response.data);
      if (response.status !== 200 || !result.success || result.data.data.id !== ownerId
        || observation.current.isError || observation.current.data?.status !== 'approved') {
        throw new Error('Approved access was not confirmed for this account.');
      }
      // One current, verified account transition. Never write another user's
      // response or promote from the application-status label alone.
      useAuthStore.getState().setUser(result.data.data);
      routerRef.current.replace(Routes.PROVIDER_TABS.DASHBOARD);
    } catch {
      if (current()) setActivationError('Provider access could not be confirmed for this account. Refresh your application status, then try again. You can still use your customer workspace.');
    } finally {
      if (activeFlight.current === scope) activeFlight.current = null;
      if (current()) setActivating(false);
    }
  }, [current, ownerId, scope]);

  useEffect(() => {
    if (query.data?.status !== 'approved' || query.isError || query.isFetching || !eligible || !screenActive || attemptedScope.current === scope) return;
    attemptedScope.current = scope;
    void activate();
  }, [query.data?.status, query.isError, query.isFetching, eligible, screenActive, scope, activate]);

  if (!eligible) return <Redirect href={auth.user?.role === 'provider' ? Routes.PROVIDER_TABS.DASHBOARD : Routes.AUTH.LOGIN} />;
  const application = query.data;
  const copy = application ? statusCopy[application.status] : null;
  const loading = query.isLoading;
  const approved = application?.status === 'approved';
  const restricted = application?.status === 'rejected' || application?.status === 'suspended' || application?.status === 'deactivated';

  return <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.width} accessibilityLabel={isPhone ? 'Application review status' : 'Tablet and desktop application review status workspace'}>
        <Text style={styles.heading} accessibilityRole="header">Provider application</Text>
        <View style={[styles.columns, !isPhone && styles.wideColumns]}>
          <View style={[styles.card, !isPhone && styles.main]}>
            <ClipboardList size={40} color={restricted ? colors.error : approved ? colors.success : colors.primary} />
            <Text style={styles.title} accessibilityRole="header">
              {loading ? 'Checking application status…' : copy?.title ?? (query.isError ? 'Status unavailable' : 'No provider application found')}
            </Text>
            {loading ? <ActivityIndicator accessibilityLabel="Loading application status" color={colors.primary} />
              : <Text style={styles.body}>{copy?.body ?? (query.isError
                ? 'We could not verify the current status. Your submitted application and saved draft have not been changed.'
                : 'No submitted provider application was found for this account. You can start or return to an unsubmitted application.')}</Text>}
            {query.isError && <Text style={styles.error} accessibilityRole="alert">
              {application ? 'We could not refresh your status. The last confirmed status is shown. Please try again.' : 'Please try again to check your application status.'}
            </Text>}
            {application?.status === 'rejected' && <View style={styles.reason}>
              <Text style={styles.label}>Reason provided</Text>
              <Text style={styles.body}>{application.rejectionReason?.trim() || 'No rejection reason was included. Contact support for clarification.'}</Text>
            </View>}
            {approved && <View style={styles.reason}>
              {activationError && <Text style={styles.error} accessibilityRole="alert">{activationError}</Text>}
              <Text style={styles.body} accessibilityLiveRegion="polite">{activating ? 'Opening your provider workspace…' : 'Your approval is saved. Provider access still needs to be confirmed.'}</Text>
              {activationError && <Button title="Retry provider access" onPress={() => { void activate(); }}
                disabled={activating || query.isError || query.isFetching} loading={activating} />}
            </View>}
            <Button title={query.isFetching ? 'Checking status…' : 'Refresh application status'} variant="outline"
              onPress={() => { void query.refetch(); }} disabled={query.isFetching || activating} />
            {!loading && !query.isError && !application && <Button title="Start or return to application"
              onPress={() => router.replace(Routes.PROVIDER_ONBOARDING.ROLE_SELECT)} />}
            <Button title="Go to Customer Home" variant={application && !approved ? 'primary' : 'outline'} onPress={() => router.replace(Routes.TABS.HOME)} />
          </View>
          <View style={[styles.card, !isPhone && styles.help]}>
            <Text style={styles.title} accessibilityRole="header">Review and support</Text>
            <Text style={styles.body}>{application?.status === 'pending'
              ? 'Our team checks your submitted details and documents. A completion date is not available yet.'
              : approved ? 'If your provider workspace does not open, refresh your status or retry access. Contact support if you still need help.'
                : 'Contact support if you need help understanding your application status or account access.'}</Text>
            <Text style={styles.body}>{application?.status === 'pending'
              ? 'You can check decisions here and in your notification history. While you wait, you can continue using your customer workspace.'
              : 'Check your notification history for messages about your application and account.'}</Text>
            <Button title="Contact support" variant="outline" onPress={() => router.push(Routes.SUPPORT.INBOX)} />
            <Button title="Notification history" variant="ghost" onPress={() => router.push(Routes.CUSTOMER.NOTIFICATIONS)} />
            <Button title={helpOpen ? 'Hide review guidance' : 'What happens after a decision?'} variant="ghost" onPress={() => setHelpOpen(value => !value)} />
            {helpOpen && <View style={styles.reason}>
              <Text style={styles.body}>After approval, your provider workspace opens once your account access is confirmed. You can then manage your services and availability.</Text>
              <Text style={styles.body}>If your application was declined or your provider access is restricted, contact support. You cannot edit or resubmit a submitted application here yet.</Text>
            </View>}
          </View>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.base, paddingVertical: spacing.xl },
  width: { width: '100%', maxWidth: 1040, alignSelf: 'center', gap: spacing.lg },
  heading: { ...typography.h1, color: colors.text },
  columns: { gap: spacing.lg }, wideColumns: { flexDirection: 'row', alignItems: 'flex-start' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.base },
  main: { flex: 1.2, minWidth: 0 }, help: { flex: 1, minWidth: 0 },
  title: { ...typography.h2, color: colors.text }, label: { ...typography.body, fontWeight: '600', color: colors.text },
  body: { ...typography.body, color: colors.textSecondary }, error: { ...typography.bodySmall, color: colors.error },
  reason: { gap: spacing.sm },
});
