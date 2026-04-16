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
  basePrice: number;
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
  setSubcategory: (id: string, name: string, basePrice: number) => void;
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
  basePrice: 0,
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
        basePrice: 0,
        addons: [],
      },
      serviceFee: 0,
      total: 0,
      addonsTotal: 0,
    })),

  setSubcategory: (id, name, basePrice) =>
    set((s) => {
      const fee = computeFee(basePrice);
      return {
        draft: {
          ...s.draft,
          subcategoryId: id,
          subcategoryName: name,
          basePrice,
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
        total: basePrice + fee,
        addonsTotal: 0,
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
