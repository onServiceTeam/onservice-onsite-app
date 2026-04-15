import api from './api';
import type { ApiResponse } from './api';

export interface DataExportEntry {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  format: 'json' | 'csv';
  fileUrl: string | null;
  fileSizeBytes: number | null;
  completedAt: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AccountDeletionEntry {
  id: string;
  userId: string;
  status: 'pending' | 'cooling_off' | 'processing' | 'completed' | 'cancelled';
  reason: string | null;
  requestedAt: string;
  coolingOffEndsAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export async function requestDataExport(format: 'json' | 'csv' = 'json'): Promise<DataExportEntry> {
  const res = await api.post<ApiResponse<DataExportEntry>>('/api/v1/account/data-export', { format });
  return res.data.data;
}

export async function getDataExportStatus(): Promise<DataExportEntry[]> {
  const res = await api.get<ApiResponse<DataExportEntry[]>>('/api/v1/account/data-export');
  return res.data.data;
}

export async function requestAccountDeletion(reason?: string): Promise<AccountDeletionEntry> {
  const res = await api.post<ApiResponse<AccountDeletionEntry>>('/api/v1/account/deletion', { reason });
  return res.data.data;
}

export async function cancelAccountDeletion(): Promise<void> {
  await api.post('/api/v1/account/deletion/cancel');
}

export async function getAccountDeletionStatus(): Promise<AccountDeletionEntry | null> {
  const res = await api.get<ApiResponse<AccountDeletionEntry | null>>('/api/v1/account/deletion/status');
  return res.data.data;
}
