import { create } from 'zustand';

export interface OnboardingState {
  selectedRole: 'customer' | 'provider' | null;
  businessName: string;
  categoryIds: string[];
  serviceRadiusKm: number;
  latitude: number | null;
  longitude: number | null;
  city: string;
  province: string;
  governmentIdFrontUri: string | null;
  governmentIdBackUri: string | null;
  nbiClearanceUri: string | null;
  selfieUri: string | null;
  icAgreed: boolean;

  setRole: (role: 'customer' | 'provider') => void;
  setBusinessName: (name: string) => void;
  setCategories: (ids: string[]) => void;
  setServiceArea: (area: { radiusKm: number; lat: number; lng: number; city: string; province: string }) => void;
  setDocument: (field: 'governmentIdFrontUri' | 'governmentIdBackUri' | 'nbiClearanceUri' | 'selfieUri', uri: string) => void;
  setIcAgreed: (agreed: boolean) => void;
  reset: () => void;
}

const initialState = {
  selectedRole: null as OnboardingState['selectedRole'],
  businessName: '',
  categoryIds: [] as string[],
  serviceRadiusKm: 10,
  latitude: null as number | null,
  longitude: null as number | null,
  city: '',
  province: '',
  governmentIdFrontUri: null as string | null,
  governmentIdBackUri: null as string | null,
  nbiClearanceUri: null as string | null,
  selfieUri: null as string | null,
  icAgreed: false,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,

  setRole: (role) => set({ selectedRole: role }),
  setBusinessName: (name) => set({ businessName: name }),
  setCategories: (ids) => set({ categoryIds: ids }),
  setServiceArea: (area) => set({
    serviceRadiusKm: area.radiusKm,
    latitude: area.lat,
    longitude: area.lng,
    city: area.city,
    province: area.province,
  }),
  setDocument: (field, uri) => set({ [field]: uri }),
  setIcAgreed: (agreed) => set({ icAgreed: agreed }),
  reset: () => set(initialState),
}));
