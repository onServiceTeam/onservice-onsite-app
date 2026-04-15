import api from './api';
import type { ApiResponse } from './api';

export interface Tip {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  amount: number;
  paymentMethod: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface SendTipPayload {
  bookingId: string;
  amount: number;
  paymentMethod: 'wallet' | 'gcash' | 'maya' | 'card';
  message?: string;
}

export async function sendTip(data: SendTipPayload): Promise<Tip> {
  const res = await api.post<ApiResponse<Tip>>('/api/v1/tips', data);
  return res.data.data;
}

export async function getBookingTips(bookingId: string): Promise<Tip[]> {
  const res = await api.get<ApiResponse<Tip[]>>(`/api/v1/tips/booking/${bookingId}`);
  return res.data.data;
}
