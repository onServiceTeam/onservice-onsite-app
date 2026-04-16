import { useBookingStore } from '@/stores/booking.store';

/**
 * Convenience hook wrapping the Zustand booking draft store.
 * Provides booking draft state + actions for the multi-step booking flow.
 */
export function useBooking() {
  const draft = useBookingStore((s) => s.draft);
  const serviceFee = useBookingStore((s) => s.serviceFee);
  const total = useBookingStore((s) => s.total);
  const addonsTotal = useBookingStore((s) => s.addonsTotal);
  const setCategory = useBookingStore((s) => s.setCategory);
  const setSubcategory = useBookingStore((s) => s.setSubcategory);
  const setAddons = useBookingStore((s) => s.setAddons);
  const setSchedule = useBookingStore((s) => s.setSchedule);
  const setAddress = useBookingStore((s) => s.setAddress);
  const setDescription = useBookingStore((s) => s.setDescription);
  const setPaymentMethod = useBookingStore((s) => s.setPaymentMethod);
  const reset = useBookingStore((s) => s.reset);

  return {
    draft,
    serviceFee,
    total,
    addonsTotal,
    setCategory,
    setSubcategory,
    setAddons,
    setSchedule,
    setAddress,
    setDescription,
    setPaymentMethod,
    reset,
    /** True if the draft has enough data to proceed to checkout */
    isReadyForCheckout: !!(
      draft.categoryId &&
      draft.subcategoryId &&
      draft.scheduledDate &&
      draft.scheduledTime &&
      draft.address &&
      draft.paymentMethod
    ),
  };
}
