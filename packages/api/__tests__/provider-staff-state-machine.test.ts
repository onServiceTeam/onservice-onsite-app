// D23 provider-staff — Phase 1 foundation. Real assertions on the pure approval
// state machine + DTO formatter (no DB needed; the DB ops build on these).

import {
  canTransitionStaffStatus,
  statusForDecision,
  isAssignable,
  formatProviderStaff,
  STAFF_STATUS_TRANSITIONS,
  type ProviderStaffRow,
  type StaffStatus,
} from '../src/services/provider-staff.service';

describe('provider-staff approval state machine', () => {
  it('an invited member can move to pending_review (member accepts + submits)', () => {
    expect(canTransitionStaffStatus('invited', 'pending_review')).toBe(true);
  });

  it('a pending_review member can be approved or rejected by back-office', () => {
    expect(canTransitionStaffStatus('pending_review', 'approved')).toBe(true);
    expect(canTransitionStaffStatus('pending_review', 'rejected')).toBe(true);
  });

  it('cannot approve straight from invited (must be reviewed first)', () => {
    expect(canTransitionStaffStatus('invited', 'approved')).toBe(false);
  });

  it('an approved member can be suspended and later reactivated', () => {
    expect(canTransitionStaffStatus('approved', 'suspended')).toBe(true);
    expect(canTransitionStaffStatus('suspended', 'approved')).toBe(true);
  });

  it('a provider can remove (deactivate) a member in any active state', () => {
    (['invited', 'pending_review', 'approved', 'rejected', 'suspended'] as StaffStatus[]).forEach((from) => {
      expect(canTransitionStaffStatus(from, 'deactivated')).toBe(true);
    });
  });

  it('deactivated is terminal — no transitions out', () => {
    expect(STAFF_STATUS_TRANSITIONS.deactivated).toHaveLength(0);
    (['approved', 'pending_review', 'invited'] as StaffStatus[]).forEach((to) => {
      expect(canTransitionStaffStatus('deactivated', to)).toBe(false);
    });
  });

  it('maps back-office decisions to the right status', () => {
    expect(statusForDecision('approved')).toBe('approved');
    expect(statusForDecision('rejected')).toBe('rejected');
    expect(statusForDecision('sent_back')).toBe('invited');
  });

  it('only approved members are assignable to jobs', () => {
    expect(isAssignable('approved')).toBe(true);
    (['invited', 'pending_review', 'rejected', 'suspended', 'deactivated'] as StaffStatus[]).forEach((s) => {
      expect(isAssignable(s)).toBe(false);
    });
  });
});

describe('formatProviderStaff DTO', () => {
  const row: ProviderStaffRow = {
    id: 's1', provider_id: 'p1', user_id: 'u1', role_title: 'Aircon technician',
    status: 'approved', invited_by: 'owner1', invite_phone: '+639170000000',
    invite_email: null, invite_token: null, invite_expires_at: null,
    submitted_for_review_at: null, admin_reviewer_id: null, admin_decision: null,
    admin_decision_at: null, admin_decision_reason: null,
    rating: '4.50', total_jobs: 12, total_reviews: 10,
    created_at: new Date('2026-06-01T00:00:00Z'), updated_at: new Date('2026-06-02T00:00:00Z'),
  };

  it('maps snake_case columns to camelCase and coerces rating to a number', () => {
    const dto = formatProviderStaff(row);
    expect(dto.providerId).toBe('p1');
    expect(dto.roleTitle).toBe('Aircon technician');
    expect(dto.rating).toBe(4.5);
    expect(typeof dto.rating).toBe('number');
  });

  it('exposes isAssignable derived from status', () => {
    expect(formatProviderStaff({ ...row, status: 'approved' }).isAssignable).toBe(true);
    expect(formatProviderStaff({ ...row, status: 'suspended' }).isAssignable).toBe(false);
  });
});
