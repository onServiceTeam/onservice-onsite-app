import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors, typography } from '@/config/theme';
import { Home, ClipboardList, MessageSquare, Wallet, User } from '@/components/icons';
import { DESKTOP_SHELL_MIN_WIDTH, TAB_BAR_HEIGHT } from '@/utils/responsive';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';
import TesterFeedbackButton, { FEEDBACK_BUTTON_BOTTOM_GAP } from '@/components/feedback/TesterFeedbackButton';
import { isTesterFeedbackEnabled } from '@/components/feedback/SendFeedbackLink';
import { useCustomerRequestSummary } from '@/hooks/useCustomerRequestSummary';
import { useChatUnreadCount } from '@/hooks/useChatInbox';
import { tabBadge } from '@/utils/tab-badge';

type TabIconProps = { focused: boolean; color: string };

/**
 * Tester builds only: the floating Feedback button (44 px tall, sitting
 * FEEDBACK_BUTTON_BOTTOM_GAP above the tab bar) would otherwise cover the
 * bottom of every tab screen, for example the first "How it works" step on
 * Home before scrolling. Each tab screen ends this much higher so nothing
 * sits under the button. Normal builds get no extra space.
 */
const TESTER_TAB_SCENE_CLEARANCE = 44 + FEEDBACK_BUTTON_BOTTOM_GAP * 2;

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
  // D38 Milestone 2: requests with a quote waiting for the customer's
  // decision, and unread messages.
  const { awaitingDecisionCount } = useCustomerRequestSummary();
  const unreadMessages = useChatUnreadCount();
  const testerClearance = isTesterFeedbackEnabled();

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
        tabBarBadgeStyle: styles.badge,
        ...(testerClearance ? { sceneStyle: styles.testerScene } : {}),
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
          tabBarBadge: tabBadge(awaitingDecisionCount),
          tabBarAccessibilityLabel: awaitingDecisionCount > 0
            ? `Bookings, ${awaitingDecisionCount} ${awaitingDecisionCount === 1 ? 'quote' : 'quotes'} to review`
            : 'Bookings',
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: tabIcon(MessageSquare),
          tabBarBadge: tabBadge(unreadMessages),
          tabBarAccessibilityLabel: unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages',
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
  badge: { backgroundColor: colors.accent, color: colors.text, fontSize: 11, fontWeight: '700' },
  hiddenTabBar: { display: 'none' },
  testerScene: { paddingBottom: TESTER_TAB_SCENE_CLEARANCE },
});
