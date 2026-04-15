/**
 * Booking status state machine types.
 * Strict discriminated union — enforce valid transitions only.
 */
export type BookingStatus =
  | 'requested'
  | 'quoted'
  | 'matched'
  | 'payment_pending'
  | 'paid'
  | 'provider_en_route'
  | 'provider_arrived'
  | 'in_progress'
  | 'completed_by_provider'
  | 'confirmed'
  | 'disputed'
  | 'resolved'
  | 'payout_ready'
  | 'paid_out'
  | 'cancelled_by_customer'
  | 'cancelled_by_provider'
  | 'cancelled_by_admin';

export type EscrowStatus =
  | 'pending'
  | 'held'
  | 'released'
  | 'refunded'
  | 'partially_refunded';

export type BookingType = 'fixed_price' | 'quote_based';

export interface Booking {
  id: string;
  customerId: string;
  providerId: string | null;
  serviceCategoryId: string;
  serviceSubcategoryId: string;
  bookingType: BookingType;
  status: BookingStatus;
  escrowStatus: EscrowStatus;
  servicePrice: number;      // in centavos
  serviceFee: number;         // in centavos
  totalAmount: number;        // in centavos
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  scheduledAt: Date;
  completedAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Valid booking status transitions — ENFORCE STRICTLY.
 * Every status change must call canTransition() first.
 * Invalid transitions return HTTP 409 Conflict.
 */
export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['quoted', 'matched', 'cancelled_by_customer', 'cancelled_by_admin'],
  quoted: ['matched', 'cancelled_by_customer', 'cancelled_by_admin'],
  matched: ['payment_pending', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'],
  payment_pending: ['paid', 'cancelled_by_customer', 'cancelled_by_admin'],
  paid: ['provider_en_route', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'],
  provider_en_route: ['provider_arrived', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'],
  provider_arrived: ['in_progress', 'cancelled_by_admin'],
  in_progress: ['completed_by_provider', 'cancelled_by_admin'],
  completed_by_provider: ['confirmed', 'disputed'],
  confirmed: ['payout_ready'],
  disputed: ['resolved'],
  resolved: ['payout_ready', 'cancelled_by_admin'],
  payout_ready: ['paid_out'],
  paid_out: [],
  cancelled_by_customer: [],
  cancelled_by_provider: [],
  cancelled_by_admin: [],
};

/**
 * Check if a booking status transition is valid.
 * Use this for ALL status changes — reject invalid with HTTP 409.
 */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
