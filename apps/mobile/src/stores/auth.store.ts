import { create } from 'zustand';
import api, { storage } from '@/services/api';

export interface User {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: 'customer' | 'provider' | 'admin';
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  otpRequestId: string | null;

  hydrate: () => void;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  register: (phone: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  otpRequestId: null,

  hydrate: () => {
    const token = storage.getString('accessToken');
    const userJson = storage.getString('user');
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as User;
        set({ user, isAuthenticated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  requestOtp: async (phone: string) => {
    await api.post('/api/v1/auth/send-otp', { phone });
    set({ otpRequestId: phone });
  },

  verifyOtp: async (phone: string, code: string) => {
    const res = await api.post('/api/v1/auth/verify-otp', { phone, code });
    const { accessToken, refreshToken, user, isNewUser } = res.data.data;
    storage.set('accessToken', accessToken);
    storage.set('refreshToken', refreshToken);
    storage.set('user', JSON.stringify(user));
    if (isNewUser) {
      storage.set('isNewUser', 'true');
    }
    set({ user, isAuthenticated: true, otpRequestId: null });
  },

  register: async (_phone: string, firstName: string, lastName: string) => {
    const token = storage.getString('accessToken');
    if (!token) throw new Error('Must verify OTP before completing registration.');
    const res = await api.patch('/api/v1/auth/me', { firstName, lastName });
    const user = res.data.data;
    storage.set('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    storage.delete('accessToken');
    storage.delete('refreshToken');
    storage.delete('user');
    storage.delete('pushToken');
    set({ user: null, isAuthenticated: false, otpRequestId: null });
  },

  setUser: (user: User) => {
    storage.set('user', JSON.stringify(user));
    set({ user });
  },
}));
