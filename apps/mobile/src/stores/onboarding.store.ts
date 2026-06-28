import { create } from 'zustand';

export interface VettingReference {
  name: string;
  contact: string;
  relation: string;
}

// The expanded provider vetting questionnaire. Everything except yearsExperience
// rides in providers.vetting_answers (JSONB) so we can keep adding fields with
// no migration. All optional at submit time except skills + the first reference.
export interface VettingData {
  mainSkills: string;
  hasOwnTools: boolean;
  businessType: string;   // Solo / Team / Registered company
  yearStarted: string;
  teamSize: string;
  fullAddress: string;
  website: string;
  facebook: string;
  socialOther: string;    // IG / TikTok / portfolio, etc.
  credentials: string;    // TESDA / PRC / licenses / certifications
  registrations: string;  // DTI / SEC / BIR TIN / business permit numbers
  resumeUrl: string;      // link to a CV / portfolio
  references: VettingReference[];
}

export const emptyVetting: VettingData = {
  mainSkills: '',
  hasOwnTools: false,
  businessType: '',
  yearStarted: '',
  teamSize: '',
  fullAddress: '',
  website: '',
  facebook: '',
  socialOther: '',
  credentials: '',
  registrations: '',
  resumeUrl: '',
  references: [],
};

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
  // Phase K MED-K07: optional NBI expiry + ID number captured on the
  // documents step. Backend (mig 115 + provider.validators.ts) accepts
  // them as optional fields on /providers/apply.
  nbiExpiryDate: string | null;
  governmentIdNumber: string | null;
  // Vetting questionnaire (onboarding step between service-area and
  // documents). Captured into the snapshot the application submits.
  // yearsExperience maps to providers.years_experience when the apply
  // endpoint supports it; the rest travel in the submission snapshot.
  yearsExperience: number | null;
  vetting: VettingData;

  setRole: (role: 'customer' | 'provider') => void;
  setBusinessName: (name: string) => void;
  setCategories: (ids: string[]) => void;
  setServiceArea: (area: { radiusKm: number; lat: number; lng: number; city: string; province: string }) => void;
  setDocument: (field: 'governmentIdFrontUri' | 'governmentIdBackUri' | 'nbiClearanceUri' | 'selfieUri', uri: string) => void;
  setIcAgreed: (agreed: boolean) => void;
  setNbiExpiryDate: (date: string | null) => void;
  setGovernmentIdNumber: (idNumber: string | null) => void;
  setVetting: (data: { yearsExperience: number | null; vetting: VettingData }) => void;
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
  // Phase K MED-K07
  nbiExpiryDate: null as string | null,
  governmentIdNumber: null as string | null,
  // Vetting questionnaire defaults.
  yearsExperience: null as number | null,
  vetting: { ...emptyVetting } as VettingData,
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
  // Phase K MED-K07 setters.
  setNbiExpiryDate: (date) => set({ nbiExpiryDate: date }),
  setGovernmentIdNumber: (idNumber) => set({ governmentIdNumber: idNumber }),
  setVetting: (data) => set({ yearsExperience: data.yearsExperience, vetting: data.vetting }),
  reset: () => set(initialState),
}));
