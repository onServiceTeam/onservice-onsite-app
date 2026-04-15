import api from './api';
import type { ApiResponse } from './api';

export interface SlotWaitlistEntry {
  id: string;
  customerId: string;
  categoryId: string;
  subcategoryId: string | null;
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  city: string;
  province: string;
  status: 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled';
  notifiedAt: string | null;
  bookedBookingId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface JoinSlotWaitlistParams {
  categoryId: string;
  subcategoryId?: string;
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  city: string;
  province: string;
}

export async function joinSlotWaitlist(params: JoinSlotWaitlistParams): Promise<SlotWaitlistEntry> {
  const res = await api.post<ApiResponse<SlotWaitlistEntry>>('/api/v1/bookings/slot-waitlist', params);
  return res.data.data;
}

export async function getSlotWaitlist(status?: string): Promise<SlotWaitlistEntry[]> {
  const res = await api.get<ApiResponse<SlotWaitlistEntry[]>>('/api/v1/bookings/slot-waitlist', {
    params: status ? { status } : {},
  });
  return res.data.data;
}

export async function cancelSlotWaitlist(waitlistId: string): Promise<void> {
  await api.delete(`/api/v1/bookings/slot-waitlist/${waitlistId}`);
}
