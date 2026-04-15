import { create } from 'zustand';
import * as recurringApi from '@/services/recurring.service';
import type { RecurringBooking, RecurringInstance, CreateRecurringParams } from '@/services/recurring.service';

interface RecurringState {
  items: RecurringBooking[];
  selectedItem: RecurringBooking | null;
  instances: RecurringInstance[];
  isLoading: boolean;
  error: string | null;
  total: number;

  fetchRecurringBookings: (page?: number) => Promise<void>;
  fetchRecurringBooking: (id: string) => Promise<void>;
  fetchInstances: (id: string, page?: number) => Promise<void>;
  createRecurring: (params: CreateRecurringParams) => Promise<RecurringBooking>;
  pauseRecurring: (id: string) => Promise<void>;
  resumeRecurring: (id: string) => Promise<void>;
  cancelRecurring: (id: string, reason?: string) => Promise<void>;
  skipNext: (id: string, skipDate: string) => Promise<void>;
  clearError: () => void;
}

export const useRecurringStore = create<RecurringState>((set, get) => ({
  items: [],
  selectedItem: null,
  instances: [],
  isLoading: false,
  error: null,
  total: 0,

  fetchRecurringBookings: async (page = 1): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const result = await recurringApi.getRecurringBookings(page);
      set({ items: result.items, total: result.total, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load recurring bookings.',
        isLoading: false,
      });
    }
  },

  fetchRecurringBooking: async (id: string): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const item = await recurringApi.getRecurringBooking(id);
      set({ selectedItem: item, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load recurring booking.',
        isLoading: false,
      });
    }
  },

  fetchInstances: async (id: string, page = 1): Promise<void> => {
    try {
      const result = await recurringApi.getRecurringInstances(id, page);
      set({ instances: result.items });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load instances.' });
    }
  },

  createRecurring: async (params: CreateRecurringParams): Promise<RecurringBooking> => {
    set({ isLoading: true, error: null });
    try {
      const item = await recurringApi.createRecurringBooking(params);
      set((state) => ({
        items: [item, ...state.items],
        isLoading: false,
      }));
      return item;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create recurring booking.',
        isLoading: false,
      });
      throw err;
    }
  },

  pauseRecurring: async (id: string): Promise<void> => {
    try {
      const updated = await recurringApi.pauseRecurringBooking(id);
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? updated : i)),
        selectedItem: state.selectedItem?.id === id ? updated : state.selectedItem,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to pause.' });
    }
  },

  resumeRecurring: async (id: string): Promise<void> => {
    try {
      const updated = await recurringApi.resumeRecurringBooking(id);
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? updated : i)),
        selectedItem: state.selectedItem?.id === id ? updated : state.selectedItem,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to resume.' });
    }
  },

  cancelRecurring: async (id: string, reason?: string): Promise<void> => {
    try {
      const updated = await recurringApi.cancelRecurringBooking(id, reason);
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? updated : i)),
        selectedItem: state.selectedItem?.id === id ? updated : state.selectedItem,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to cancel.' });
    }
  },

  skipNext: async (id: string, skipDate: string): Promise<void> => {
    try {
      const updated = await recurringApi.skipNextInstance(id, skipDate);
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? updated : i)),
        selectedItem: state.selectedItem?.id === id ? updated : state.selectedItem,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to skip instance.' });
    }
  },

  clearError: (): void => set({ error: null }),
}));
