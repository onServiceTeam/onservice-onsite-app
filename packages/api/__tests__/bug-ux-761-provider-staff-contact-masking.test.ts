import {
  formatProviderStaffForAdmin,
  type ProviderStaffRow,
} from '../src/services/provider-staff.service';

describe('Bug UX-761 — provider staff invite contact privacy', () => {
  it('Bug UX-761 — masks invite contact for admins while preserving the super-admin view', () => {
    const row: ProviderStaffRow = {
      id: '10000000-0000-4000-8000-000000000761',
      provider_id: '20000000-0000-4000-8000-000000000761',
      user_id: null,
      role_title: 'Lead technician',
      status: 'pending_review',
      invited_by: '30000000-0000-4000-8000-000000000761',
      invite_phone: '+639171234567',
      invite_email: 'technician@example.com',
      invite_token: null,
      invite_expires_at: null,
      submitted_for_review_at: new Date('2026-08-31T00:00:00.000Z'),
      admin_reviewer_id: null,
      admin_decision: null,
      admin_decision_at: null,
      admin_decision_reason: null,
      rating: '0',
      total_jobs: 0,
      total_reviews: 0,
      created_at: new Date('2026-08-31T00:00:00.000Z'),
      updated_at: new Date('2026-08-31T00:00:00.000Z'),
    };

    expect(formatProviderStaffForAdmin(row, 'admin')).toMatchObject({
      invitePhone: '+63 9XX XXX 4567',
      inviteEmail: 't•••@example.com',
      contactMasked: true,
    });
    expect(formatProviderStaffForAdmin(row, 'super_admin')).toMatchObject({
      invitePhone: '+639171234567',
      inviteEmail: 'technician@example.com',
      contactMasked: false,
    });
  });
});
