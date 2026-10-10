import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, useSegments } from 'expo-router';
import { Button } from '@/components/ui';
import { Routes } from '@/config/navigation';
import { colors, spacing, typography } from '@/config/theme';
import { useAuthStore } from '@/stores/auth.store';
import { loadApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';

/** Load before controls with useState(initialDraft) mount. Status is canonical. */
export function ProviderApplicationSessionGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useAuthStore(state => state.user);
  const session = useApplicationSession();
  const segments = useSegments();
  const route = segments[segments.length - 1];
  const statusRoute = route === 'review-pending' || route === 'background-check-status';
  const entryRoute = route === 'role-select';
  const ownerId = user?.role === 'customer' ? user.id : null;
  const [returnToCustomer, setReturnToCustomer] = useState(false);

  useEffect(() => {
    const current = useApplicationSession.getState();
    if (current.activeRoute !== (route ?? null)) {
      useApplicationSession.setState({ activeRoute: route ?? null, routeEpoch: current.routeEpoch + 1 });
    }
  }, [route]);

  useEffect(() => {
    if (ownerId && !statusRoute && !entryRoute && (session.ownerId !== ownerId || session.phase === 'idle')) {
      void loadApplicationSession(ownerId);
    }
  }, [ownerId, statusRoute, entryRoute, session.ownerId, session.phase]);

  if (returnToCustomer) return <Redirect href={Routes.TABS.HOME} />;
  if (statusRoute || entryRoute) return <>{children}</>;
  if (!ownerId) return <Redirect href={Routes.AUTH.LOGIN} />;
  if (session.ownerId === ownerId && session.phase === 'submitted') {
    return <Redirect href={Routes.PROVIDER_ONBOARDING.REVIEW_PENDING} />;
  }
  if (session.ownerId === ownerId && session.phase === 'ready') {
    return <React.Fragment key={`${ownerId}:${session.generation}`}>{children}</React.Fragment>;
  }
  const failed = session.ownerId === ownerId && session.phase === 'error';
  return (
    <View style={styles.page}>
      <View style={styles.content} accessibilityRole={failed ? 'alert' : undefined}>
        <Text style={styles.title}>Your provider application</Text>
        {failed ? <>
          <Text style={styles.body}>{session.error ?? 'Your saved application could not be loaded.'}</Text>
          <Text style={styles.body}>We have not replaced your saved work. Retry before editing.</Text>
          <Button title="Retry loading application" onPress={() => { void loadApplicationSession(ownerId); }} />
          <Button title="Return to customer workspace" variant="outline" onPress={() => setReturnToCustomer(true)} />
        </> : <>
          <ActivityIndicator accessibilityLabel="Loading saved application" color={colors.primary} />
          <Text style={styles.body}>Checking for saved work…</Text>
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted, padding: spacing.base, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: spacing.base },
  title: { ...typography.h2, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
});
