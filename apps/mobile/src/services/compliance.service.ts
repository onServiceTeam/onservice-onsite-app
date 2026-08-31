/**
 * Phase 13 Dispatch C — Customer-side compliance API client.
 *
 * Wraps POST /api/v1/compliance/dsr and (LAUNCH-LIMITATIONS #3 fix —
 * 2026-05-02) GET /api/v1/compliance/my-requests so the mobile UI can
 * show the customer's DSR history without emailing the DPO.
 */

import api from './api';
import type { ApiResponse } from './api';

export type DsrRequestType =
  | 'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection';

export type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected';

export interface DsrRecord {
  id: string;
  requestType: DsrRequestType;
  status: DsrStatus;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
  userMessage: string | null;
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

// LAUNCH-LIMITATIONS #3 fix — list the caller's DSR history.
// Backend filters by user_id at the service layer; the limit query
// param is clamped server-side to [1, 200].
export async function listMyDsrs(limit = 50): Promise<DsrRecord[]> {
  const res = await api.get<ApiResponse<DsrRecord[]>>(
    `/api/v1/compliance/my-requests?limit=${limit}`,
  );
  return res.data.data;
}

// LAUNCH-LIMITATIONS #5 fix — pending material re-consent surface.
// Returns the list of consent types the caller has not re-acknowledged
// since the most recent material publish. The mobile shell calls this
// on app start and after the user grants/revokes a consent. An empty
// list is the steady-state and means no re-consent is required.

export interface PendingMaterialConsent {
  consentType: string;
  latestVersion: string;
  effectiveAt: string;
  changeSummary: string;
  /** Version the user previously granted (if any). */
  userCurrentVersion: string | null;
  /** When the user last took an action on this consent type. */
  userLastActionAt: string | null;
  /** Their last action — drives the prompt copy. */
  userLastAction: 'granted' | 'revoked' | null;
}

export async function listPendingMaterialConsents(): Promise<PendingMaterialConsent[]> {
  const res = await api.get<ApiResponse<PendingMaterialConsent[]>>(
    '/api/v1/compliance/my-pending-consents',
  );
  return res.data.data;
}

// Same canonical body shape as the existing recordConsent backend.
export async function recordConsent(input: {
  consentType: string;
  version: string;
  granted: boolean;
}): Promise<void> {
  await api.post('/api/v1/compliance/consent', input);
}
