import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import { DESKTOP_SHELL_MIN_WIDTH } from '@/utils/responsive';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';

type TabIconProps = { focused: boolean; color: string };

function tabIcon(
  Icon: React.ComponentType<{ size?: number; color?: string }>,
): (props: TabIconProps) => React.ReactElement {
  return ({ focused, color }) => (
    <Icon
      size={focused ? 24 : 22}
      color={focused ? colors.secondary : (color ?? colors.textTertiary)}
    />
  );
}

export default function ProviderTabLayout(): React.ReactElement {
  const { width } = useWindowDimensions();
  const hideForDesktopShell = Platform.OS === 'web' && width >= DESKTOP_SHELL_MIN_WIDTH;
  return (
    <RoleRouteGuard allowedRoles={['provider']}>
      <View style={{ flex: 1 }}>
        <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: hideForDesktopShell ? styles.hiddenTabBar : styles.tabBar,
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
    </RoleRouteGuard>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 80,
    paddingTop: 8,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  hiddenTabBar: { display: 'none' },
});
