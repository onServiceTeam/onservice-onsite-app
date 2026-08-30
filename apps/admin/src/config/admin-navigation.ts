import type React from 'react';
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
  Tag,
  User,
  Settings,
  Activity,
  Shield,
  Lock,
  FileText,
  MessageSquare,
  Hammer,
} from '@/components/icons';
import type { AdminUser } from '@/stores/auth.store';

export type AdminNavItem = {
  to: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  roles?: AdminUser['role'][];
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

/**
 * One information architecture for the sidebar, tablet drawer, and command
 * search. Routes are grouped by the work an onService employee is trying to
 * complete, rather than by the order in which pages happened to be built.
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Command',
    items: [
      {
        to: '/',
        Icon: LayoutDashboard,
        label: 'Command Center',
        description: 'Queues, alerts, and marketplace health',
      },
      {
        to: '/analytics',
        Icon: LineChart,
        label: 'Analytics',
        description: 'Demand, quality, and growth reporting',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        to: '/bookings',
        Icon: ClipboardList,
        label: 'Bookings',
        description: 'Booking queue and case details',
      },
      {
        to: '/dispatch',
        Icon: Activity,
        label: 'Dispatch',
        description: 'Live coverage and provider assignment',
      },
      {
        to: '/recurring',
        Icon: Repeat,
        label: 'Recurring Work',
        description: 'Schedules, skips, and exceptions',
      },
      {
        to: '/projects',
        Icon: Hammer,
        label: 'Projects',
        description: 'Longer work and milestones',
      },
      {
        to: '/service-areas',
        Icon: MapPin,
        label: 'Service Areas',
        description: 'Markets, coverage, and capacity',
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        to: '/providers',
        Icon: Wrench,
        label: 'Providers',
        description: 'Applications, vetting, and provider 360',
      },
      {
        to: '/customers',
        Icon: Users,
        label: 'Customers',
        description: 'Customer accounts and booking history',
      },
      {
        to: '/business-accounts',
        Icon: Building2,
        label: 'Business Accounts',
        description: 'Companies, members, and billing',
      },
    ],
  },
  {
    label: 'Support & Trust',
    items: [
      {
        to: '/support-tickets',
        Icon: Ticket,
        label: 'Support Queue',
        description: 'Tickets, SLAs, replies, and notes',
      },
      {
        to: '/communications',
        Icon: MessageSquare,
        label: 'Communications',
        description: 'Conversations and delivery status',
      },
      {
        to: '/feedback',
        Icon: ClipboardList,
        label: 'Tester Feedback',
        description: 'Product research, bugs, and ideas',
      },
      {
        to: '/disputes',
        Icon: Scale,
        label: 'Disputes',
        description: 'Evidence, decisions, and escalations',
      },
    ],
  },
  {
    label: 'Money',
    items: [
      {
        to: '/financials',
        Icon: Coins,
        label: 'Financials',
        description: 'Payments, escrow, refunds, and reconciliation',
      },
      {
        to: '/payouts',
        Icon: Banknote,
        label: 'Payouts',
        description: 'Provider disbursement queue',
      },
      {
        to: '/pricing-rules',
        Icon: TrendingUp,
        label: 'Pricing Rules',
        description: 'Canonical service pricing controls',
      },
    ],
  },
  {
    label: 'Growth & Content',
    items: [
      {
        to: '/catalog',
        Icon: Package,
        label: 'Service Catalog',
        description: 'Taxonomy, intake, and add-ons',
      },
      {
        to: '/marketing',
        Icon: Tag,
        label: 'Marketing',
        description: 'Campaigns, promotions, and referrals',
      },
      {
        to: '/notification-templates',
        Icon: Megaphone,
        label: 'Notification Templates',
        description: 'Customer and provider message templates',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      {
        to: '/privacy',
        Icon: Shield,
        label: 'Privacy Workspace',
        description: 'DPO queues, deadlines, and privacy controls',
        roles: ['super_admin', 'dpo'],
      },
      {
        to: '/compliance',
        Icon: Shield,
        label: 'Compliance',
        description: 'Tax, audit, and regulatory operations',
        roles: ['super_admin', 'admin'],
      },
      {
        to: '/data-protection-log',
        Icon: Lock,
        label: 'Data Protection',
        description: 'Data subject request operations',
        roles: ['super_admin', 'dpo'],
      },
      {
        to: '/consent-versions',
        Icon: FileText,
        label: 'Consent Versions',
        description: 'Published legal-document history',
        roles: ['super_admin', 'dpo'],
      },
      {
        to: '/audit-log',
        Icon: Search,
        label: 'Audit Log',
        description: 'Who changed what and when',
      },
      {
        to: '/staff',
        Icon: User,
        label: 'Staff & Roles',
        description: 'Access, roles, and account status',
        roles: ['super_admin'],
      },
      {
        to: '/settings',
        Icon: Settings,
        label: 'System Settings',
        description: 'Platform configuration',
        roles: ['super_admin', 'admin'],
      },
      {
        to: '/settings/cancellation-policy',
        Icon: Settings,
        label: 'Cancellation Policy',
        description: 'Customer-facing policy editor under money review',
        roles: ['super_admin'],
      },
    ],
  },
];

export function visibleAdminNavGroups(role: AdminUser['role'] | undefined): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!role) return false;
      if (item.roles) return item.roles.includes(role);
      // D34 — unspecified legacy routes are operations routes, never implicit
      // DPO routes. Privacy items must opt in explicitly above.
      return role !== 'dpo';
    }),
  })).filter((group) => group.items.length > 0);
}

export function visibleAdminNavItems(role: AdminUser['role'] | undefined): AdminNavItem[] {
  return visibleAdminNavGroups(role).flatMap((group) => group.items);
}
