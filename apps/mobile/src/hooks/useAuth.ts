import { useAuthStore, type User } from '@/stores/auth.store';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrate: () => void;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  register: (phone: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  isProvider: boolean;
  isCustomer: boolean;
}

/**
 * Convenience hook wrapping the Zustand auth store.
 * Provides auth state + actions for login, logout, and user management.
 */
export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hydrate = useAuthStore((s) => s.hydrate);
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);

  return {
    user,
    isAuthenticated,
    isLoading,
    hydrate,
    requestOtp,
    verifyOtp,
    register,
    logout,
    setUser,
    /** Shorthand: true if user has provider role */
    isProvider: user?.role === 'provider',
    /** Shorthand: true if user has customer role */
    isCustomer: user?.role === 'customer',
  };
}
