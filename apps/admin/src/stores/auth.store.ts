import { create } from 'zustand';

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

  hydrate: () => void;
  login: (user: AdminUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: () => {
    const token = localStorage.getItem('admin_token');
    const userJson = localStorage.getItem('admin_user');
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as AdminUser;
        if (user.role === 'admin' || user.role === 'super_admin') {
          set({ user, isAuthenticated: true, isLoading: false });
          return;
        }
      } catch { /* fall through */ }
    }
    set({ isLoading: false });
  },

  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('admin_token', accessToken);
    localStorage.setItem('admin_refresh', refreshToken);
    localStorage.setItem('admin_user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh');
    localStorage.removeItem('admin_user');
    set({ user: null, isAuthenticated: false });
  },
}));
