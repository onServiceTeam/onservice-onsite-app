import { formatBusinessAccountForMember } from '../src/services/business.service';

it('Bug OPS-342 — an ordinary company member cannot receive account credit and payment terms through the profile endpoint', () => {
  const formatted = formatBusinessAccountForMember({
    id: 'business-342',
    company_name: 'Private Terms Co',
    business_type: 'other',
    registration_number: null,
    tax_id: null,
    billing_address: 'Cebu City',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    contact_person: 'Account Owner',
    contact_email: 'owner@example.test',
    contact_phone: '+639170000000',
    account_manager_id: null,
    owner_user_id: 'owner-342',
    status: 'active',
    payment_terms: 'net_30',
    volume_discount_rate: '7.5',
    monthly_credit_limit: 7_500_000,
    notes: null,
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    updated_at: new Date('2026-09-01T00:00:00.000Z'),
    viewer_role: 'member',
    viewer_can_book: true,
    viewer_can_approve: false,
    viewer_can_view_invoices: false,
  });

  expect(formatted).toMatchObject({
    paymentTerms: null,
    volumeDiscountRate: null,
    monthlyCreditLimit: null,
    viewerPermissions: {
      role: 'member',
      canBook: true,
      canApprove: false,
      canViewInvoices: false,
      canViewFinancials: false,
    },
  });
});
