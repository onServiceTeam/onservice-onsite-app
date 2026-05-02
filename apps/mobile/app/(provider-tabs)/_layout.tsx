import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs, Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors, typography } from '@/config/theme';
import NewJobModal from '@/components/provider/NewJobModal';
import { LayoutDashboard, Wrench, Coins, User } from '@/components/icons';
// Phase K CRIT-K02 fix — provider tabs MUST gate on user.role ===
// 'provider'. Pre-fix any signed-in user (customer, anonymous,
// pending-approval applicant) could navigate directly to
// /(provider-tabs)/dashboard via deep link or back-button history
// and see the provider dashboard chrome. Real data didn't load
// (server gates per-endpoint), but the UI revealed the existence /
// shape of provider features to non-providers.
import { useAuthStore } from '@/stores/auth.store';
import { Routes } from '@/config/navigation';

type TabIconProps = { focused: boolean; color: string };

function tabIcon(Icon: React.ComponentType<{ size?: number; color?: string }>): (props: TabIconProps) => React.ReactElement {
  return ({ focused, color }) => (
    <Icon size={focused ? 24 : 22} color={focused ? colors.secondary : color ?? colors.textTertiary} />
  );
}

export default function ProviderTabLayout(): React.ReactElement {
  // Phase K CRIT-K02 — role gate. Customer / anonymous / not-yet-
  // approved applicants get bounced to the customer tabs (or auth
  // landing if not signed in).
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userRole = useAuthStore((s) => s.user?.role);
  if (!isAuthenticated) {
    return <Redirect href={Routes.AUTH.LOGIN} />;
  }
  if (userRole !== 'provider') {
    return <Redirect href={Routes.TABS.HOME} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.secondary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: tabIcon(LayoutDashboard),
          }}
        />
        <Tabs.Screen
          name="jobs"
          options={{
            title: 'Jobs',
            tabBarIcon: tabIcon(Wrench),
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: 'Earnings',
            tabBarIcon: tabIcon(Coins),
          }}
        />
        <Tabs.Screen
          name="provider-profile"
          options={{
            title: 'Profile',
            tabBarIcon: tabIcon(User),
          }}
        />
      </Tabs>

      {/* Global new-job notification overlay — renders over any tab */}
      <NewJobModal />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopColor: colors.divider,
    height: 80,
    paddingTop: 8,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
});
