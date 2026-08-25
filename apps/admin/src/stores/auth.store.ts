import { create } from 'zustand';
import api from '@/lib/api';

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  // E01 / D15 — `dpo` is a real role with NPC RA 10173 §21 segregation.
  role: 'admin' | 'super_admin' | 'dpo';
  avatarUrl: string | null;
}

interface AuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * LAUNCH-LIMITATIONS #12 — when true the user must rotate their
   * password before reaching any other admin route. The post-login,
   * post-2FA-verify, and /auth/me responses all carry this flag; the
   * App-level route guard reads `useAuthStore().mustRotatePassword`
   * and redirects to /change-password when set. clearMustRotate is
   * called by the change-password page on success.
   */
  mustRotatePassword: boolean;

  hydrate: () => Promise<void>;
  login: (user: AdminUser, opts?: { mustRotatePassword?: boolean }) => void;
  clearMustRotate: () => void;
  logout: () => Promise<void>;
}

const ADMIN_TIER_ROLES: ReadonlySet<string> = new Set(['admin', 'super_admin', 'dpo']);

export function hasAdminSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)admin_csrf=/.test(document.cookie);
}

// Bug 1251 fix: tokens are stored in HttpOnly cookies, never in localStorage.
// Hydration calls /api/v1/auth/me — if the admin_session cookie is valid the
// server returns the user; otherwise we stay logged out.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  mustRotatePassword: false,

  hydrate: async () => {
    // One-time migration for users still carrying tokens from before this fix:
    // wipe legacy localStorage keys so they never get used again.
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh');
      localStorage.removeItem('admin_user');
    } catch { /* not a hard requirement */ }

    // The readable CSRF cookie is issued and cleared with the two HttpOnly
    // admin session cookies. A first-time visitor has none of the three, so
    // avoid generating expected /auth/me + /refresh 401s on the login screen.
    // Returning admins still hydrate and refresh normally because their CSRF
    // session hint remains present.
    if (!hasAdminSessionHint()) {
      set({ user: null, isAuthenticated: false, isLoading: false, mustRotatePassword: false });
      return;
    }

    try {
      const res = await api.get<{
        success: true;
        data: AdminUser & { id: string; role: string; mustRotatePassword?: boolean };
      }>('/api/v1/auth/me');
      const u = res.data.data;
      if (u && ADMIN_TIER_ROLES.has(u.role)) {
        set({
          user: u as AdminUser,
          isAuthenticated: true,
          isLoading: false,
          mustRotatePassword: u.mustRotatePassword === true,
        });
        return;
      }
    } catch {
      // Not authenticated — fall through.
    }
    set({ user: null, isAuthenticated: false, isLoading: false, mustRotatePassword: false });
  },

  login: (user, opts) => {
    set({
      user,
      isAuthenticated: true,
      mustRotatePassword: opts?.mustRotatePassword === true,
    });
  },

  clearMustRotate: () => {
    set({ mustRotatePassword: false });
  },

  logout: async () => {
    try {
      await api.post('/api/v1/auth/admin/logout');
    } catch { /* best effort — clear local state regardless */ }
    set({ user: null, isAuthenticated: false, mustRotatePassword: false });
  },
}));
