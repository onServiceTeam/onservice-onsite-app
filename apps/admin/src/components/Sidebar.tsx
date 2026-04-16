import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/providers', icon: '🔧', label: 'Providers' },
  { to: '/customers', icon: '👥', label: 'Customers' },
  { to: '/bookings', icon: '📋', label: 'Bookings' },
  { to: '/catalog', icon: '📦', label: 'Catalog' },
  { to: '/pricing-rules', icon: '💹', label: 'Pricing Rules' },
  { to: '/disputes', icon: '⚖️', label: 'Disputes' },
  { to: '/financials', icon: '💰', label: 'Financials' },
  { to: '/payouts', icon: '💸', label: 'Payouts' },
  { to: '/notification-templates', icon: '📣', label: 'Templates' },
  { to: '/recurring', icon: '🔄', label: 'Recurring' },
  { to: '/business-accounts', icon: '🏢', label: 'Business' },
  { to: '/service-areas', icon: '📍', label: 'Service Areas' },
  { to: '/analytics', icon: '📈', label: 'Analytics' },
  { to: '/audit-log', icon: '🔍', label: 'Audit Log' },
  { to: '/support-tickets', icon: '🎫', label: 'Support' },
  { to: '/staff', icon: '👤', label: 'Staff & Roles' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Sidebar(): React.ReactElement {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-[var(--color-sidebar)] text-white flex flex-col z-20">
      <div className="px-5 py-5 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-[var(--color-secondary)]">on</span>Service
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Admin Panel</p>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
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
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-white/10">
        <p className="text-xs text-slate-500">v0.1.0</p>
      </div>
    </aside>
  );
}
