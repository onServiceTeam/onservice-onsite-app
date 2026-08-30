import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from '@/components/icons';
import { ADMIN_NAV_GROUPS } from '@/config/admin-navigation';
import { useAuthStore } from '@/stores/auth.store';

function routeContext(pathname: string): { group: string; label: string; to: string; record?: string } | null {
  const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
  const exact = items.find((item) => item.to === pathname);
  if (exact) return { group: exact.group, label: exact.label, to: exact.to };

  const parent = items
    .filter((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (!parent) return null;
  const record = decodeURIComponent(pathname.slice(parent.to.length + 1)).split('/')[0];
  return { group: parent.group, label: parent.label, to: parent.to, record };
}

export default function AdminBreadcrumbs(): React.ReactElement | null {
  const { pathname } = useLocation();
  const role = useAuthStore((state) => state.user?.role);
  const context = routeContext(pathname);
  if (!context || pathname === '/') return null;
  const home = role === 'dpo' ? { label: 'Privacy', to: '/privacy' } : { label: 'Command', to: '/' };

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex min-h-6 items-center gap-2 text-xs text-[var(--color-text-secondary)]">
      <Link to={home.to} className="font-semibold text-[var(--color-primary)] hover:underline">{home.label}</Link>
      <ChevronRight size={14} aria-hidden="true" />
      <span>{context.group}</span>
      <ChevronRight size={14} aria-hidden="true" />
      {context.record ? (
        <>
          <Link to={context.to} className="font-semibold text-[var(--color-primary)] hover:underline">{context.label}</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="max-w-56 truncate font-mono text-[var(--color-text)]" title={context.record}>{context.record}</span>
        </>
      ) : (
        <span className="font-semibold text-[var(--color-text)]" aria-current="page">{context.label}</span>
      )}
    </nav>
  );
}
