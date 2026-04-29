import { create } from 'zustand';
import api from '@/lib/api';

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'super_admin';
  avatarUrl: string | null;
}

interface AuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  hydrate: () => Promise<void>;
  login: (user: AdminUser) => void;
  logout: () => Promise<void>;
}

// Bug 1251 fix: tokens are stored in HttpOnly cookies, never in localStorage.
// Hydration calls /api/v1/auth/me — if the admin_session cookie is valid the
// server returns the user; otherwise we stay logged out.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: async () => {
    // One-time migration for users still carrying tokens from before this fix:
    // wipe legacy localStorage keys so they never get used again.
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh');
      localStorage.removeItem('admin_user');
    } catch { /* not a hard requirement */ }

    try {
      const res = await api.get<{ success: true; data: AdminUser & { id: string; role: string } }>(
        '/api/v1/auth/me',
      );
      const u = res.data.data;
      if (u && (u.role === 'admin' || u.role === 'super_admin')) {
        set({ user: u as AdminUser, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch {
      // Not authenticated — fall through.
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  login: (user) => {
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await api.post('/api/v1/auth/admin/logout');
    } catch { /* best effort — clear local state regardless */ }
    set({ user: null, isAuthenticated: false });
  },
}));
