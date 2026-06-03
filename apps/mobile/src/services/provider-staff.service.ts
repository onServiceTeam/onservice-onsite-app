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
  const res = await api.get<ApiResponse<ProviderStaffMember[]>>('/api/v1/provider/staff');
  return res.data.data;
}

export async function inviteStaff(params: {
  phone?: string;
  email?: string;
  roleTitle?: string;
}): Promise<ProviderStaffMember> {
  const res = await api.post<ApiResponse<ProviderStaffMember>>('/api/v1/provider/staff', params);
  return res.data.data;
}

export async function removeStaff(staffId: string): Promise<ProviderStaffMember> {
  const res = await api.delete<ApiResponse<ProviderStaffMember>>(`/api/v1/provider/staff/${staffId}`);
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
