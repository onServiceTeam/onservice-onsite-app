import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useNavigate } from 'react-router-dom';
import { Bell, Menu, Search } from '@/components/icons';
import { visibleAdminNavItems } from '@/config/admin-navigation';

interface HeaderProps {
  onOpenNavigation?: () => void;
}

export default function Header({ onOpenNavigation }: HeaderProps): React.ReactElement {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const navItems = useMemo(() => visibleAdminNavItems(user?.role), [user?.role]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return navItems.slice(0, 6);
    return navItems
      .filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [navItems, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login');
  };

  const chooseResult = (to: string): void => {
    navigate(to);
    setQuery('');
    setSearchOpen(false);
  };

  const handleSearchSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (results[0]) chooseResult(results[0].to);
  };

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin';
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex min-h-18 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenNavigation}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={22} />
      </button>

      <form
        onSubmit={handleSearchSubmit}
        className="relative min-w-0 flex-1 lg:max-w-2xl"
        role="search"
      >
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
          className="h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] pl-10 pr-14 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)] focus:bg-white"
          aria-label="Jump to an admin page"
          aria-expanded={searchOpen}
          aria-controls="admin-command-results"
          placeholder="Jump to a page or workspace..."
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)] sm:block">
          /
        </kbd>

        {searchOpen && (
          <div
            id="admin-command-results"
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-xl"
          >
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
              Page and workspace search
            </div>
            {results.length === 0 ? (
              <p className="px-4 py-5 text-sm text-[var(--color-text-secondary)]">
                No matching admin page.
              </p>
            ) : (
              <ul>
                {results.map((item) => (
                  <li key={item.to}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseResult(item.to)}
                      className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--color-surface-hover)]"
                    >
                      <item.Icon size={18} className="shrink-0 text-[var(--color-primary)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--color-text)]">
                          {item.label}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-text-secondary)]">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">
              Record-level search by booking, person, ticket, or payout ID is tracked separately and
              is not simulated here.
            </p>
          </div>
        )}
      </form>

      <button
        type="button"
        onClick={() => navigate('/#operational-alerts')}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
        aria-label="View operational alerts"
      >
        <Bell size={20} />
      </button>

      <div className="hidden items-center gap-3 border-l border-[var(--color-border)] pl-4 sm:flex">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-primary)] text-xs font-bold text-white"
          aria-hidden="true"
        >
          {initials || 'A'}
        </div>
        <div className="hidden text-right xl:block">
          <p className="max-w-36 truncate text-sm font-semibold text-[var(--color-text)]">
            {displayName}
          </p>
          <p className="text-xs capitalize text-[var(--color-text-secondary)]">
            {user?.role?.replace('_', ' ') ?? 'admin'}
          </p>
        </div>
        <button
          onClick={() => void handleLogout()}
          className="min-h-11 rounded-md px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
