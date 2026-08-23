// apps/mobile/src/components/WebAppFrame.tsx
//
// Responsive web shell. AUTO-adapts to the real window width across phone,
// tablet, and desktop (see src/utils/responsive.ts) — no manual ?view needed,
// though ?view=mobile|desktop still force-overrides that URL for testing. Native
// (iOS/Android) is a pure passthrough — zero change.
//
//   • phone  (< 700px): the app fills the viewport (mobile web).
//   • tablet (700-999px): a centered app surface (up to 920px) on a light backdrop.
//   • desktop (>= 1180px): a role-aware navigation rail plus a wide content
//     workspace. This replaces the old widened-phone presentation.
import React from 'react';
import {
  Platform,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { Routes } from '@/config/navigation';
import {
  Home,
  ClipboardList,
  Wallet,
  Folder,
  Heart,
  HelpCircle,
  User,
  LayoutDashboard,
  Wrench,
  Inbox,
  Calendar,
  Users,
  Coins,
  Briefcase,
  UserCheck,
} from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import {
  resolveLayout,
  getForcedView,
  getAppContentWidth as resolveContentWidth,
  PHONE_COLUMN_MAX_WIDTH,
  DESKTOP_CONTENT_MAX_WIDTH,
  DESKTOP_SHELL_MIN_WIDTH,
  DESKTOP_SHELL_MAX_WIDTH,
} from '@/utils/responsive';

// Backward-compatible re-exports (existing imports point at WebAppFrame).
export { getForcedView } from '@/utils/responsive';
export const COLUMN_MAX_WIDTH = PHONE_COLUMN_MAX_WIDTH;
export const DESKTOP_MAX_WIDTH = DESKTOP_CONTENT_MAX_WIDTH;
export function getAppContentWidth(): number {
  return resolveContentWidth();
}

type DesktopNavItem = {
  label: string;
  route: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  matches: string[];
};

const CUSTOMER_NAV: DesktopNavItem[] = [
  { label: 'Home', route: Routes.TABS.HOME, Icon: Home, matches: ['/home'] },
  {
    label: 'Bookings',
    route: Routes.TABS.BOOKINGS,
    Icon: ClipboardList,
    matches: ['/bookings', '/customer/booking'],
  },
  {
    label: 'Wallet',
    route: Routes.TABS.WALLET,
    Icon: Wallet,
    matches: ['/wallet', '/customer/wallet', '/customer/payment'],
  },
  {
    label: 'Projects',
    route: Routes.CUSTOMER.PROJECTS,
    Icon: Folder,
    matches: ['/customer/projects'],
  },
  {
    label: 'Suki Pros',
    route: Routes.CUSTOMER.SUKI_PROS,
    Icon: Heart,
    matches: ['/customer/suki-pros'],
  },
  {
    label: 'Team Invitations',
    route: Routes.STAFF.INVITES,
    Icon: UserCheck,
    matches: ['/staff/invites'],
  },
  {
    label: 'Support',
    route: Routes.SUPPORT.INBOX,
    Icon: HelpCircle,
    matches: ['/support', '/customer/help', '/customer/safety'],
  },
  {
    label: 'Profile',
    route: Routes.TABS.PROFILE,
    Icon: User,
    matches: ['/profile', '/customer/account', '/customer/addresses', '/customer/notification'],
  },
];

const PROVIDER_NAV: DesktopNavItem[] = [
  {
    label: 'Dashboard',
    route: Routes.PROVIDER_TABS.DASHBOARD,
    Icon: LayoutDashboard,
    matches: ['/dashboard'],
  },
  {
    label: 'Jobs',
    route: Routes.PROVIDER_TABS.JOBS,
    Icon: Wrench,
    matches: ['/jobs', '/provider/job'],
  },
  {
    label: 'Job Requests',
    route: Routes.PROVIDER.LEADS,
    Icon: Inbox,
    matches: ['/provider/leads'],
  },
  {
    label: 'Schedule',
    route: Routes.PROVIDER.SCHEDULE,
    Icon: Calendar,
    matches: ['/provider/schedule', '/provider/calendar', '/provider/availability'],
  },
  {
    label: 'Clients',
    route: Routes.PROVIDER.CLIENTS,
    Icon: Users,
    matches: ['/provider/clients', '/provider/suki-customers'],
  },
  {
    label: 'Earnings',
    route: Routes.PROVIDER_TABS.EARNINGS,
    Icon: Coins,
    matches: ['/earnings', '/provider/payout', '/provider/withdraw'],
  },
  { label: 'Team', route: Routes.PROVIDER.TEAM, Icon: Briefcase, matches: ['/provider/team'] },
  {
    label: 'Support',
    route: Routes.SUPPORT.INBOX,
    Icon: HelpCircle,
    matches: ['/support', '/provider/help'],
  },
  {
    label: 'Profile',
    route: Routes.PROVIDER_TABS.PROVIDER_PROFILE,
    Icon: User,
    matches: [
      '/provider-profile',
      '/provider/settings',
      '/provider/account',
      '/provider/portfolio',
      '/provider/certifications',
    ],
  },
];

const STAFF_NAV: DesktopNavItem[] = [
  {
    label: 'Assigned Jobs',
    route: Routes.STAFF.JOBS,
    Icon: UserCheck,
    matches: ['/staff/jobs', '/staff/job'],
  },
  { label: 'Invitations', route: Routes.STAFF.INVITES, Icon: Inbox, matches: ['/staff/invites'] },
  { label: 'Support', route: Routes.SUPPORT.INBOX, Icon: HelpCircle, matches: ['/support'] },
];

export function isDesktopShellRoute(pathname: string): boolean {
  return !(
    pathname === '/' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/provider-onboarding')
  );
}

export function isRouteOwnedByRole(pathname: string, role: string): boolean {
  const providerTabRoute = ['/dashboard', '/jobs', '/earnings', '/provider-profile']
    .some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const customerTabRoute = ['/home', '/bookings', '/wallet', '/profile']
    .some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (pathname === '/provider' || pathname.startsWith('/provider/') || providerTabRoute) {
    return role === 'provider';
  }
  if (pathname === '/customer' || pathname.startsWith('/customer/') || customerTabRoute) {
    return role === 'customer';
  }
  if (pathname === '/staff' || pathname.startsWith('/staff/')) {
    return role === 'provider_staff';
  }
  return true;
}

export function DesktopNavigation({
  role,
  pathname,
  displayName,
}: {
  role: string;
  pathname: string;
  displayName: string;
}): React.ReactElement {
  const router = useRouter();
  const isProvider = role === 'provider';
  const isStaff = role === 'provider_staff';
  const items = isStaff ? STAFF_NAV : isProvider ? PROVIDER_NAV : CUSTOMER_NAV;
  const workspace = isStaff
    ? 'Staff workspace'
    : isProvider
      ? 'Provider workspace'
      : 'Customer workspace';

  return (
    <View style={styles.navRail} accessibilityLabel={`${workspace} navigation`}>
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>oS</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>onService PH</Text>
          <Text style={styles.workspaceLabel}>{workspace}</Text>
        </View>
      </View>

      <Text style={styles.navSectionLabel}>Workspace</Text>
      <View style={styles.navItems}>
        {items.map((item) => {
          const active = item.matches.some(
            (match) => pathname === match || pathname.startsWith(`${match}/`),
          );
          return (
            <TouchableOpacity
              key={item.label}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              onPress={() => router.push(item.route)}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <item.Icon size={20} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.accountBlock}>
        <View style={styles.accountAvatar}>
          <Text style={styles.accountAvatarText}>{displayName.charAt(0).toUpperCase() || 'U'}</Text>
        </View>
        <View style={styles.accountCopy}>
          <Text numberOfLines={1} style={styles.accountName}>
            {displayName}
          </Text>
          <Text style={styles.accountRole}>
            {isStaff ? 'Team member' : isProvider ? 'Service provider' : 'Customer'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function WebAppFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const layout = resolveLayout(width, getForcedView());

  // Phone width (or forced mobile on a wide screen): forced-mobile shows the
  // phone column on a dark backdrop; a genuinely small window fills the viewport.
  if (layout.breakpoint === 'phone') {
    if (getForcedView() === 'mobile') {
      return (
        <View style={styles.backdrop}>
          <View style={[styles.column, { maxWidth: PHONE_COLUMN_MAX_WIDTH }]}>{children}</View>
        </View>
      );
    }
    return <View style={styles.fullBleed}>{children}</View>;
  }

  const useDesktopShell =
    width >= DESKTOP_SHELL_MIN_WIDTH
    && isAuthenticated
    && user !== null
    && isDesktopShellRoute(pathname)
    && isRouteOwnedByRole(pathname, user.role);

  if (useDesktopShell && user) {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Account';
    return (
      <View style={styles.surfaceBackdrop}>
        <View style={[styles.desktopShell, { maxWidth: DESKTOP_SHELL_MAX_WIDTH }]}>
          <DesktopNavigation role={user.role} pathname={pathname} displayName={displayName} />
          <View style={styles.desktopContent}>{children}</View>
        </View>
      </View>
    );
  }

  // Tablet / compact desktop: a centered app surface sized to the breakpoint.
  return (
    <View style={styles.surfaceBackdrop}>
      <View style={[styles.column, { maxWidth: layout.width }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullBleed: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0f1b24',
  },
  surfaceBackdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#E7EBF5',
  },
  column: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 0 32px rgba(5, 26, 62, 0.16)' },
      default: {},
    }),
  },
  desktopShell: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    backgroundColor: colors.background,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 0 32px rgba(5, 26, 62, 0.16)' },
      default: {},
    }),
  },
  desktopContent: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  navRail: {
    width: 232,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.lg,
    paddingBottom: spacing.base,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brandMarkText: { ...typography.button, color: colors.white, fontWeight: '700' },
  brandCopy: { flex: 1, minWidth: 0 },
  brandName: { ...typography.h3, color: colors.text, fontSize: 17 },
  workspaceLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  navSectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  navItems: { flex: 1, gap: 2, paddingHorizontal: spacing.sm },
  navItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: colors.primaryLight,
    borderLeftColor: colors.primary,
  },
  navItemText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  navItemTextActive: { color: colors.primary },
  accountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  accountAvatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  accountAvatarText: { ...typography.button, color: colors.white },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  accountRole: { ...typography.caption, color: colors.textSecondary },
});

export default WebAppFrame;
