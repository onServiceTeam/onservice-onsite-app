import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors, typography } from '@/config/theme';
import NewJobModal from '@/components/provider/NewJobModal';
import { LayoutDashboard, Wrench, Coins, User } from '@/components/icons';

type TabIconProps = { focused: boolean; color: string };

function tabIcon(Icon: React.ComponentType<{ size?: number; color?: string }>): (props: TabIconProps) => React.ReactElement {
  return ({ focused, color }) => (
    <Icon size={focused ? 24 : 22} color={focused ? colors.secondary : color ?? colors.textTertiary} />
  );
}

export default function ProviderTabLayout(): React.ReactElement {
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
