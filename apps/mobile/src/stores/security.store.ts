import { create } from 'zustand';
import * as securityApi from '@/services/security.service';
import type { DeviceEntry } from '@/services/security.service';

interface SecurityState {
  devices: DeviceEntry[];
  isLoading: boolean;
  error: string | null;

  fetchDevices: () => Promise<void>;
  trustDevice: (deviceId: string) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
  clearError: () => void;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  devices: [],
  isLoading: false,
  error: null,

  fetchDevices: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const devices = await securityApi.getDevices();
      set({ devices, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load devices.', isLoading: false });
    }
  },

  trustDevice: async (deviceId): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await securityApi.trustDevice(deviceId);
      set((state) => ({
        devices: state.devices.map((d) =>
          d.id === deviceId ? { ...d, isTrusted: true } : d,
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to trust device.', isLoading: false });
    }
  },

  removeDevice: async (deviceId): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await securityApi.removeDevice(deviceId);
      set((state) => ({
        devices: state.devices.filter((d) => d.id !== deviceId),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove device.', isLoading: false });
    }
  },

  clearError: (): void => set({ error: null }),
}));
