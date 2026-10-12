import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors, typography } from '@/config/theme';
import { Home, ClipboardList, Wallet, User } from '@/components/icons';
import { DESKTOP_SHELL_MIN_WIDTH, TAB_BAR_HEIGHT } from '@/utils/responsive';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';
import TesterFeedbackButton from '@/components/feedback/TesterFeedbackButton';

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
      <View style={styles.container}>
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
      {/* Tester builds only: the floating Feedback button, on the tab
          screens only so it never covers a screen's main action button. */}
      <TesterFeedbackButton tabBarHidden={hideForDesktopShell} />
      </View>
    </RoleRouteGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: TAB_BAR_HEIGHT,
    paddingTop: 8,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  hiddenTabBar: { display: 'none' },
});
