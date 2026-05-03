import React from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useNavigate } from 'react-router-dom';

export default function Header(): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-[var(--color-border)] flex items-center justify-between px-6 sticky top-0 z-10">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-[var(--color-text)]">
            {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin'}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
          </p>
        </div>
        <button
          onClick={() => void handleLogout()}
          /* Phase 22f a11y fix — was text-[var(--color-danger)] (#ef4444)
             on white = 3.76:1, fails WCAG AA 4.5:1. red-600 (#dc2626)
             on white = 4.83:1, passes. */
          className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
