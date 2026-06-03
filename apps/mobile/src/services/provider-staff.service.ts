import api from './api';
import type { ApiResponse } from './api';

// D23 — provider team members. The provider owner invites/manages their team;
// members go to onService back-office review before they can be assigned jobs.

export type StaffStatus =
  | 'invited'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'deactivated';

export interface StaffPerformance {
  totalJobs: number;
  totalReviews: number;
  averageRating: number;
}

export interface ProviderStaffMember {
  id: string;
  userId: string | null;
  userName: string | null;
  roleTitle: string | null;
  status: StaffStatus;
  invitePhone: string | null;
  inviteEmail: string | null;
  adminDecisionReason: string | null;
  isAssignable: boolean;
  createdAt: string;
  performance: StaffPerformance;
}

export async function getMyStaff(): Promise<ProviderStaffMember[]> {
  const res = await api.get<ApiResponse<ProviderStaffMember[]>>('/api/v1/providers/staff');
  return res.data.data;
}

export async function inviteStaff(params: {
  phone?: string;
  email?: string;
  roleTitle?: string;
}): Promise<ProviderStaffMember> {
  const res = await api.post<ApiResponse<ProviderStaffMember>>('/api/v1/providers/staff', params);
  return res.data.data;
}

export async function removeStaff(staffId: string): Promise<ProviderStaffMember> {
  const res = await api.delete<ApiResponse<ProviderStaffMember>>(`/api/v1/providers/staff/${staffId}`);
  return res.data.data;
}

// Send an invited member to onService back-office for approval.
export async function submitStaffForReview(staffId: string): Promise<ProviderStaffMember> {
  const res = await api.post<ApiResponse<ProviderStaffMember>>(`/api/v1/providers/staff/${staffId}/submit`, {});
  return res.data.data;
}

// Assign (staffId) or clear (null) the team member who performs a booking.
export async function assignStaffToBooking(
  bookingId: string,
  staffId: string | null,
): Promise<ProviderStaffMember | null> {
  const res = await api.post<ApiResponse<ProviderStaffMember | null>>(
    `/api/v1/providers/bookings/${bookingId}/assign-staff`,
    { staffId },
  );
  return res.data.data;
}

// ── Staff-member self-service (D23 Phase 4) ──────────────────────────────────

export interface PendingInvite {
  staffId: string;
  providerBusinessName: string;
  roleTitle: string | null;
  invitePhone: string | null;
  inviteEmail: string | null;
}

export interface StaffAssignedJob {
  id: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  barangay: string | null;
  city: string | null;
  serviceName: string | null;
  customerName: string | null;
}

export async function getMyInvites(): Promise<PendingInvite[]> {
  const res = await api.get<ApiResponse<PendingInvite[]>>('/api/v1/staff/my-invites');
  return res.data.data;
}

// Accept an invite. Returns the fresh token pair (provider_staff role) so the
// caller can swap the session via useAuthStore().applyStaffSession.
export async function acceptInvite(staffId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
    `/api/v1/staff/accept/${staffId}`,
    {},
  );
  return { accessToken: res.data.data.accessToken, refreshToken: res.data.data.refreshToken };
}

export async function getMyAssignedJobs(): Promise<StaffAssignedJob[]> {
  const res = await api.get<ApiResponse<StaffAssignedJob[]>>('/api/v1/staff/my-jobs');
  return res.data.data;
}

// Human-readable status for the UI.
export function staffStatusLabel(status: StaffStatus): string {
  switch (status) {
    case 'invited': return 'Invited';
    case 'pending_review': return 'Pending review';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    case 'suspended': return 'Suspended';
    case 'deactivated': return 'Removed';
  }
}
