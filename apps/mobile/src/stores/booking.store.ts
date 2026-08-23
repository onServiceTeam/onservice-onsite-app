import { create } from 'zustand';
import { platformConfig } from '@/config/platform.config';

export interface SelectedAddon {
  id: string;
  name: string;
  price: number;
}

export interface BookingDraft {
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  serviceDescription: string;
  pricingType: string | null;
  basePrice: number;
  // D27 Phase 4b — hourly bookings. basePrice tracks the capped authorization
  // (rounded estimatedHours x hourlyRate); the customer is billed for actual
  // time and refunded the rest.
  isHourly: boolean;
  hourlyRate: number; // centavos per hour
  estimatedHours: number;
  addons: SelectedAddon[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  address: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string;
  paymentMethod: 'gcash' | 'maya' | 'card' | 'wallet' | 'qrph' | null;
}

interface BookingState {
  draft: BookingDraft;
  serviceFee: number;
  total: number;
  addonsTotal: number;

  setCategory: (id: string, name: string, slug: string) => void;
  setSubcategory: (
    id: string,
    name: string,
    basePrice: number,
    options?: { hourlyRate?: number; description?: string | null; pricingType?: string | null },
  ) => void;
  setEstimatedHours: (hours: number) => void;
  setAddons: (addons: SelectedAddon[]) => void;
  setSchedule: (date: string, time: string) => void;
  setAddress: (addr: {
    address: string;
    barangay: string;
    city: string;
    province: string;
    latitude: number;
    longitude: number;
  }) => void;
  setDescription: (desc: string) => void;
  setPaymentMethod: (method: BookingDraft['paymentMethod']) => void;
  reset: () => void;
}

const initialDraft: BookingDraft = {
  categoryId: null,
  categoryName: null,
  categorySlug: null,
  subcategoryId: null,
  subcategoryName: null,
  serviceDescription: '',
  pricingType: null,
  basePrice: 0,
  isHourly: false,
  hourlyRate: 0,
  estimatedHours: 1,
  addons: [],
  scheduledDate: null,
  scheduledTime: null,
  address: null,
  barangay: null,
  city: null,
  province: null,
  latitude: null,
  longitude: null,
  description: '',
  paymentMethod: null,
};

function computeFee(price: number): number {
  const fee = Math.round(price * platformConfig.serviceFeeRate);
  return Math.max(platformConfig.minimumServiceFee, Math.min(platformConfig.maximumServiceFee, fee));
}

// D27 Phase 4b — capped authorization estimate, matching the server's rounding
// (1-hour minimum, 30-minute increments).
function roundHourlyAmount(hours: number, hourlyRate: number): number {
  const minutes = Math.max(Math.ceil((hours * 60) / 30) * 30, 60);
  return Math.round((minutes / 60) * hourlyRate);
}

export const useBookingStore = create<BookingState>((set) => ({
  draft: { ...initialDraft },
  serviceFee: 0,
  total: 0,
  addonsTotal: 0,

  setCategory: (id, name, slug) =>
    set((s) => ({
      draft: {
        ...s.draft,
        categoryId: id,
        categoryName: name,
        categorySlug: slug,
        subcategoryId: null,
        subcategoryName: null,
        serviceDescription: '',
        pricingType: null,
        basePrice: 0,
        addons: [],
      },
      serviceFee: 0,
      total: 0,
      addonsTotal: 0,
    })),

  setSubcategory: (id, name, basePrice, options) =>
    set((s) => {
      const isHourly = options?.hourlyRate !== undefined;
      const hourlyRate = options?.hourlyRate ?? 0;
      // Hourly starts at the 1-hour minimum authorization.
      const estimatedHours = isHourly ? 1 : 1;
      const effectiveBase = isHourly ? roundHourlyAmount(estimatedHours, hourlyRate) : basePrice;
      const fee = computeFee(effectiveBase);
      return {
        draft: {
          ...s.draft,
          subcategoryId: id,
          subcategoryName: name,
          serviceDescription: options?.description?.trim() ?? '',
          pricingType: options?.pricingType ?? null,
          basePrice: effectiveBase,
          isHourly,
          hourlyRate,
          estimatedHours,
          addons: [],
          scheduledDate: null,
          scheduledTime: null,
          address: null,
          barangay: null,
          city: null,
          province: null,
          latitude: null,
          longitude: null,
          description: '',
          paymentMethod: null,
        },
        serviceFee: fee,
        total: effectiveBase + fee,
        addonsTotal: 0,
      };
    }),

  // D27 Phase 4b — recompute the capped authorization as the customer adjusts
  // the estimate. Mirrors the server's 1-hour min + 30-min rounding so the
  // displayed total matches what's actually held.
  setEstimatedHours: (hours) =>
    set((s) => {
      const estimatedHours = Math.max(1, hours);
      const base = roundHourlyAmount(estimatedHours, s.draft.hourlyRate);
      const fee = computeFee(base);
      return {
        draft: { ...s.draft, estimatedHours, basePrice: base },
        serviceFee: fee,
        total: base + fee,
      };
    }),

  setAddons: (addons) =>
    set((s) => {
      const addonsSum = addons.reduce((sum, a) => sum + a.price, 0);
      const subtotal = s.draft.basePrice + addonsSum;
      const fee = computeFee(subtotal);
      return {
        draft: { ...s.draft, addons },
        addonsTotal: addonsSum,
        serviceFee: fee,
        total: subtotal + fee,
      };
    }),

  setSchedule: (date, time) =>
    set((s) => ({ draft: { ...s.draft, scheduledDate: date, scheduledTime: time } })),

  setAddress: (addr) =>
    set((s) => ({ draft: { ...s.draft, ...addr } })),

  setDescription: (desc) =>
    set((s) => ({ draft: { ...s.draft, description: desc } })),

  setPaymentMethod: (method) =>
    set((s) => ({ draft: { ...s.draft, paymentMethod: method } })),

  reset: () => set({ draft: { ...initialDraft }, serviceFee: 0, total: 0, addonsTotal: 0 }),
}));
