/**
 * Phase 13 Dispatch C — Customer-side compliance API client.
 *
 * Wraps POST /api/v1/compliance/dsr. The customer-side "list my requests"
 * endpoint is not yet implemented (tracked in LAUNCH-LIMITATIONS.md);
 * the mobile UI shows the most recent submission's confirmation locally.
 */

import api from './api';
import type { ApiResponse } from './api';

export type DsrRequestType =
  | 'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection';

export type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected';

export interface DsrRecord {
  id: string;
  userId: string;
  userEmail: string | null;
  requestType: DsrRequestType;
  status: DsrStatus;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
  handledBy: string | null;
  userMessage: string | null;
  adminNotes: string | null;
  responsePayloadUrl: string | null;
  rejectionReason: string | null;
  daysUntilDue: number;
  isOverdue: boolean;
}

export async function submitDataSubjectRequest(input: {
  requestType: DsrRequestType;
  userMessage?: string;
}): Promise<DsrRecord> {
  const res = await api.post<ApiResponse<DsrRecord>>('/api/v1/compliance/dsr', {
    requestType: input.requestType,
    userMessage: input.userMessage ?? null,
  });
  return res.data.data;
}
