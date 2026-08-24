import { create } from 'zustand';
import * as serviceAreaApi from '@/services/service-area.service';
import type {
  ServiceArea,
  CoverageResult,
  ProviderAreaAssignment,
} from '@/services/service-area.service';

interface ServiceAreaState {
  areas: ServiceArea[];
  coverageResult: CoverageResult | null;
  providerAreas: ProviderAreaAssignment[];
  isLoading: boolean;
  error: string | null;

  fetchAreas: () => Promise<void>;
  checkCoverage: (lat: number, lng: number) => Promise<CoverageResult>;
  joinWaitlist: (params: {
    fullName: string;
    phone: string;
    email?: string;
    city: string;
    province: string;
    barangay?: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
  fetchProviderAreas: () => Promise<void>;
  clearError: () => void;
}

export const useServiceAreaStore = create<ServiceAreaState>((set) => ({
  areas: [],
  coverageResult: null,
  providerAreas: [],
  isLoading: false,
  error: null,

  fetchAreas: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const areas = await serviceAreaApi.getActiveServiceAreas();
      set({ areas, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load service areas.',
        isLoading: false,
      });
    }
  },

  checkCoverage: async (lat: number, lng: number): Promise<CoverageResult> => {
    set({ isLoading: true, error: null });
    try {
      const result = await serviceAreaApi.checkCoverage(lat, lng);
      set({ coverageResult: result, isLoading: false });
      return result;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to check coverage.',
        isLoading: false,
      });
      throw err;
    }
  },

  joinWaitlist: async (params): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await serviceAreaApi.joinWaitlist(params);
      set({ isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to join waitlist.',
        isLoading: false,
      });
      throw err;
    }
  },

  fetchProviderAreas: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const providerAreas = await serviceAreaApi.getMyProviderAreas();
      set({ providerAreas, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load provider areas.',
        isLoading: false,
      });
    }
  },

  clearError: (): void => set({ error: null }),
}));
