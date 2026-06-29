// D27 Phase 7 — provider CRM client (clients book).
import api from './api';
import type { ApiResponse } from './api';

export interface ProviderClient {
  customerId: string;
  customerName: string;
  jobCount: number;
  completedCount: number;
  lastJobAt: string | null;
  totalJobValue: number; // gross service value (centavos), not net of commission
}

export async function getProviderClients(): Promise<ProviderClient[]> {
  const res = await api.get<ApiResponse<ProviderClient[]>>('/api/v1/providers/me/clients');
  return res.data.data;
}
