import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors, typography } from '@/config/theme';
import NewJobModal from '@/components/provider/NewJobModal';
import { LayoutDashboard, Inbox, Wrench, Coins, User } from '@/components/icons';
// Phase K CRIT-K02 fix — provider tabs MUST gate on user.role ===
// 'provider'. Pre-fix any signed-in user (customer, anonymous,
// pending-approval applicant) could navigate directly to
// /(provider-tabs)/dashboard via deep link or back-button history
// and see the provider dashboard chrome. Real data didn't load
// (server gates per-endpoint), but the UI revealed the existence /
// shape of provider features to non-providers.
import { DESKTOP_SHELL_MIN_WIDTH, TAB_BAR_HEIGHT } from '@/utils/responsive';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';
import TesterFeedbackButton, { FEEDBACK_BUTTON_BOTTOM_GAP } from '@/components/feedback/TesterFeedbackButton';
import { isTesterFeedbackEnabled } from '@/components/feedback/SendFeedbackLink';
import { useProviderRequestSummary } from '@/hooks/useProviderRequestSummary';
import { tabBadge } from '@/utils/tab-badge';

type TabIconProps = { focused: boolean; color: string };

/**
 * Tester builds only: the floating Feedback button (44 px tall, sitting
 * FEEDBACK_BUTTON_BOTTOM_GAP above the tab bar) would otherwise cover the
 * bottom of every provider tab screen (the last request card, the last My
 * quotes row). Each tab screen ends this much higher so nothing sits under
 * the button, the same clearance as the customer tabs. Normal builds get no
 * extra space.
 */
const TESTER_TAB_SCENE_CLEARANCE = 44 + FEEDBACK_BUTTON_BOTTOM_GAP * 2;

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
  // D38 Milestone 2: requests this provider has not opened yet. This copy
  // is the live one (events and the 2-minute fallback); the dashboard and
  // Requests screens read the same cache without listeners of their own.
  const { summary } = useProviderRequestSummary({ live: true });
  const unseen = summary.unseenCount;
  const testerClearance = isTesterFeedbackEnabled();
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
          tabBarBadgeStyle: styles.badge,
          ...(testerClearance ? { sceneStyle: styles.testerScene } : {}),
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
          name="requests"
          options={{
            title: 'Requests',
            tabBarIcon: tabIcon(Inbox),
            tabBarBadge: tabBadge(unseen),
            tabBarAccessibilityLabel: unseen > 0
              ? `Requests, ${unseen} new ${unseen === 1 ? 'request' : 'requests'}`
              : 'Requests',
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

        {/* Tester builds only: the floating Feedback button, on the tab
            screens only so it never covers a screen's main action button
            (the job screen's status button sits at the bottom left). */}
        <TesterFeedbackButton tabBarHidden={hideForDesktopShell} />

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
    height: TAB_BAR_HEIGHT,
    paddingTop: 8,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  badge: { backgroundColor: colors.accent, color: colors.text, fontSize: 11, fontWeight: '700' },
  hiddenTabBar: { display: 'none' },
  testerScene: { paddingBottom: TESTER_TAB_SCENE_CLEARANCE },
});
