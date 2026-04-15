import { create } from 'zustand';
import * as pricingApi from '@/services/pricing.service';
import * as rebookingApi from '@/services/rebooking.service';
import * as slotWaitlistApi from '@/services/slot-waitlist.service';
import type { PricingResult, HolidayInfo } from '@/services/pricing.service';
import type { RebookingData, BookingHistoryItem } from '@/services/rebooking.service';
import type { SlotWaitlistEntry } from '@/services/slot-waitlist.service';

interface PricingState {
  pricingPreview: PricingResult | null;
  upcomingHolidays: HolidayInfo[];
  rebookingData: RebookingData | null;
  bookingHistory: BookingHistoryItem[];
  slotWaitlist: SlotWaitlistEntry[];
  isLoading: boolean;
  error: string | null;

  fetchPricingPreview: (basePrice: number, scheduledAt: string, categoryId: string, city?: string) => Promise<void>;
  fetchUpcomingHolidays: () => Promise<void>;
  fetchRebookingSuggestions: (bookingId: string) => Promise<void>;
  fetchBookingHistory: (categoryId?: string, limit?: number) => Promise<void>;
  fetchSlotWaitlist: (status?: string) => Promise<void>;
  joinSlotWaitlist: (params: slotWaitlistApi.JoinSlotWaitlistParams) => Promise<void>;
  cancelSlotWaitlist: (waitlistId: string) => Promise<void>;
  clearPricingPreview: () => void;
  clearError: () => void;
}

export const usePricingStore = create<PricingState>((set) => ({
  pricingPreview: null,
  upcomingHolidays: [],
  rebookingData: null,
  bookingHistory: [],
  slotWaitlist: [],
  isLoading: false,
  error: null,

  fetchPricingPreview: async (basePrice, scheduledAt, categoryId, city): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const pricingPreview = await pricingApi.getPricingPreview(basePrice, scheduledAt, categoryId, city);
      set({ pricingPreview, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load pricing.', isLoading: false });
    }
  },

  fetchUpcomingHolidays: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const upcomingHolidays = await pricingApi.getUpcomingHolidays();
      set({ upcomingHolidays, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load holidays.', isLoading: false });
    }
  },

  fetchRebookingSuggestions: async (bookingId): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const rebookingData = await rebookingApi.getRebookingSuggestions(bookingId);
      set({ rebookingData, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load rebooking suggestions.', isLoading: false });
    }
  },

  fetchBookingHistory: async (categoryId, limit): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const bookingHistory = await rebookingApi.getBookingHistory(categoryId, limit);
      set({ bookingHistory, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load booking history.', isLoading: false });
    }
  },

  fetchSlotWaitlist: async (status): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const slotWaitlist = await slotWaitlistApi.getSlotWaitlist(status);
      set({ slotWaitlist, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load waitlist.', isLoading: false });
    }
  },

  joinSlotWaitlist: async (params): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const entry = await slotWaitlistApi.joinSlotWaitlist(params);
      set((state) => ({
        slotWaitlist: [...state.slotWaitlist, entry],
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to join waitlist.', isLoading: false });
      throw err;
    }
  },

  cancelSlotWaitlist: async (waitlistId): Promise<void> => {
    try {
      await slotWaitlistApi.cancelSlotWaitlist(waitlistId);
      set((state) => ({
        slotWaitlist: state.slotWaitlist.filter((e) => e.id !== waitlistId),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to cancel waitlist entry.' });
    }
  },

  clearPricingPreview: (): void => set({ pricingPreview: null }),
  clearError: (): void => set({ error: null }),
}));
