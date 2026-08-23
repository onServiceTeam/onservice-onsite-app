import React, { useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { X } from '@/components/icons';
import { visibleAdminNavGroups } from '@/config/admin-navigation';

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

function roleLabel(role: string | undefined): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'dpo') return 'Data Protection Officer';
  return 'Operations Admin';
}

function SidebarContent({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
}): React.ReactElement {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigationRef = useRef<HTMLElement>(null);
  const groups = visibleAdminNavGroups(user?.role);
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin';

  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    const activeLink = navigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !activeLink) return;
    const navigationRect = navigation.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    if (linkRect.top < navigationRect.top || linkRect.bottom > navigationRect.bottom) {
      navigation.scrollTop = activeLink.offsetTop - (navigation.clientHeight - activeLink.clientHeight) / 2;
    }
  }, [location.pathname]);

  return (
    <>
      <div className="flex min-h-18 items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)] text-sm font-bold text-white">
          oS
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-[var(--color-text)]">
            onService PH
          </h1>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            Operations Console
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] lg:hidden"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav ref={navigationRef} aria-label="Admin workspace" className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {groups.map((group) => (
          <section
            key={group.label}
            aria-labelledby={`nav-${group.label.replace(/\W+/g, '-').toLowerCase()}`}
            className="mb-5"
          >
            <h2
              id={`nav-${group.label.replace(/\W+/g, '-').toLowerCase()}`}
              className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]"
            >
              {group.label}
            </h2>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={item.description}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group flex min-h-11 items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                        : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                    }`
                  }
                >
                  <item.Icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border)] p-4">
        <div className="mb-3 flex items-center gap-2 rounded-md bg-[var(--color-surface-hover)] px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
          <span className="text-xs font-semibold text-[var(--color-text)]">Live environment</span>
        </div>
        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{displayName}</p>
        <p className="truncate text-xs text-[var(--color-text-secondary)]">
          {roleLabel(user?.role)}
        </p>
      </div>
    </>
  );
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps): React.ReactElement {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)] lg:flex">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Close navigation"
            onClick={onClose}
          />
          <aside className="relative flex h-full w-[min(20rem,88vw)] flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)] shadow-xl">
            <SidebarContent onNavigate={onClose} onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
