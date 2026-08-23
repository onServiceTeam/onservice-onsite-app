import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { colors, typography } from '@/config/theme';
import { Home, ClipboardList, Wallet, User } from '@/components/icons';
import { DESKTOP_SHELL_MIN_WIDTH } from '@/utils/responsive';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';

type TabIconProps = { focused: boolean; color: string };

function tabIcon(
  Icon: React.ComponentType<{ size?: number; color?: string }>,
): (props: TabIconProps) => React.ReactElement {
  return ({ focused, color }) => (
    <Icon
      size={focused ? 24 : 22}
      color={focused ? colors.primary : (color ?? colors.textTertiary)}
    />
  );
}

export default function TabLayout(): React.ReactElement {
  const { width } = useWindowDimensions();
  const hideForDesktopShell = Platform.OS === 'web' && width >= DESKTOP_SHELL_MIN_WIDTH;

  return (
    <RoleRouteGuard allowedRoles={['customer']}>
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
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon(Home),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: tabIcon(ClipboardList),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: tabIcon(Wallet),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon(User),
        }}
      />
      </Tabs>
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
