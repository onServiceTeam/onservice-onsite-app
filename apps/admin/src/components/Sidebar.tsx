import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import {
  LayoutDashboard,
  Wrench,
  Users,
  ClipboardList,
  Package,
  TrendingUp,
  Scale,
  Coins,
  Banknote,
  Megaphone,
  Repeat,
  Building2,
  MapPin,
  LineChart,
  Search,
  Ticket,
  User,
  Settings,
  Activity,
  Shield,
  Lock,
  FileText,
} from '@/components/icons';

type NavItem = {
  to: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  superAdminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/', Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/providers', Icon: Wrench, label: 'Providers' },
  { to: '/customers', Icon: Users, label: 'Customers' },
  { to: '/bookings', Icon: ClipboardList, label: 'Bookings' },
  { to: '/dispatch', Icon: Activity, label: 'Dispatch' },
  { to: '/catalog', Icon: Package, label: 'Catalog' },
  { to: '/pricing-rules', Icon: TrendingUp, label: 'Pricing Rules' },
  { to: '/disputes', Icon: Scale, label: 'Disputes' },
  { to: '/financials', Icon: Coins, label: 'Financials' },
  { to: '/payouts', Icon: Banknote, label: 'Payouts' },
  { to: '/notification-templates', Icon: Megaphone, label: 'Templates' },
  { to: '/recurring', Icon: Repeat, label: 'Recurring' },
  { to: '/business-accounts', Icon: Building2, label: 'Business' },
  { to: '/service-areas', Icon: MapPin, label: 'Service Areas' },
  { to: '/analytics', Icon: LineChart, label: 'Analytics' },
  { to: '/audit-log', Icon: Search, label: 'Audit Log' },
  { to: '/compliance', Icon: Shield, label: 'Compliance' },
  { to: '/data-protection-log', Icon: Lock, label: 'Data Protection Log' },
  { to: '/consent-versions', Icon: FileText, label: 'Consent Versions' },
  { to: '/support-tickets', Icon: Ticket, label: 'Support' },
  { to: '/staff', Icon: User, label: 'Staff & Roles' },
  { to: '/settings', Icon: Settings, label: 'Settings' },
  // Bug 1170-admin-ui: super_admin-only link to the cancellation-policy editor.
  // Server enforces super_admin too; this filter just hides the link visually.
  { to: '/settings/cancellation-policy', Icon: Settings, label: 'Cancellation Policy', superAdminOnly: true },
];

export default function Sidebar(): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const visibleItems = NAV_ITEMS.filter((item) => !item.superAdminOnly || role === 'super_admin');
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-[var(--color-sidebar)] text-white flex flex-col z-20">
      <div className="px-5 py-5 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-[var(--color-secondary)]">on</span>Service
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Admin Panel</p>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--color-sidebar-hover)] text-white font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-[var(--color-sidebar-hover)]'
              }`
            }
          >
            <item.Icon size={18} className="shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-white/10">
        {/* Phase 22f a11y fix — was text-slate-500 (3.74:1 on slate-900,
            fails WCAG AA 4.5:1). slate-400 (#94a3b8) on slate-900 = 5.2:1
            which passes. axe-core dev plugin previously flagged this on
            every admin page. */}
        {/* Phase 200 — was a stale hardcoded v0.1.0 */}
        <p className="text-xs text-slate-400">v0.14.0</p>
      </div>
    </aside>
  );
}
