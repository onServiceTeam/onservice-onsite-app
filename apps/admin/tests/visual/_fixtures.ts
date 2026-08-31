// Phase 37 — Playwright fixture that seeds an admin auth state via
// route-mocking /auth/me. Without this, every spec navigating to a
// protected route (everything except /login) gets redirected to the
// login page, which means visual baselines for 28 of 29 specs were
// captured of the LOGIN screen, not the target page (CRIT-PHASE37-01).
//
// The fixture also defaults every /api/v1/admin/** GET to a sensible
// shape so pages render their default state quickly. Per-test
// page.route() calls (in the loading/empty/error sub-tests) override
// this default.
//
// Usage in specs:
//   import { test, expect } from './_fixtures';

import { test as base, expect, type Page } from '@playwright/test';

type VisualFixtureOptions = {
  authenticated: boolean;
};

/**
 * Wait until an ordinary success, empty, or error surface has left its
 * transient loading frame. Loading-state tests must not call this helper.
 * The old baseline suite photographed immediately after navigation, which
 * allowed error snapshots to silently become loading snapshots.
 */
export async function waitForVisualSettled(page: Page): Promise<void> {
  await expect(page.locator('main')).not.toContainText(/loading(?:\.{3}|…)?/i, {
    timeout: 10_000,
  });
  await page.waitForTimeout(50);
}

const FAKE_ADMIN = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'visual-baselines@onservice.test',
  phone: '+639170000099',
  firstName: 'Visual',
  lastName: 'Baselines',
  role: 'super_admin',
  avatarUrl: null,
  isVerified: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  mustRotatePassword: false,
};

// Dashboard KPI shape — must match exactly the DashboardKpis interface
// in packages/api/src/services/admin-analytics.service.ts. Earlier
// version of this fixture had three field-name mismatches (camelCase
// drift) that surfaced as blank KPI cards on Dashboard baselines:
//   providerApprovals → pendingApprovals
//   todaysBookings    → todayBookings
//   staleBookings     → staleDisputes
const KPI_OBJECT = {
  revenue: 0, revenueTrendPct: 0,
  activeBookings: 0, pendingDisputes: 0, newSignups: 0,
  pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0,
  guaranteeFund: 0, guaranteeFundRunwayMonths: 0,
};

// Acquisition Funnel shape — Dashboard renders three steps (Registered,
// First Booking, Repeat Booking) and shows "Loading funnel..." text
// when funnel.data is null. Provide a real shape so the funnel cards
// render in baselines.
const FUNNEL_OBJECT = {
  registered: 0,
  firstBooking: 0,
  repeatBooking: 0,
};

// SystemSettings shape — page expects `data: { categories: [...],
// settings: { [cat]: PlatformSetting[] } }`. Categories below match
// CATEGORY_META in SystemSettingsPage.tsx so the sidebar shows real
// labels in baselines (commissions, fees, escrow, etc).
const SETTINGS_BUNDLE = {
  categories: [
    { category: 'commissions',  count: 1 },
    { category: 'fees',         count: 0 },
    { category: 'escrow',       count: 0 },
    { category: 'cancellation', count: 0 },
    { category: 'security',     count: 0 },
    { category: 'cache',        count: 0 },
  ],
  settings: {
    commissions: [{
      id: 'SETTING-0001', category: 'commissions', subcategory: 'provider',
      key: 'commission_rate_verified', label: 'Verified provider commission',
      description: 'Platform commission charged on completed work by verified providers.',
      valueType: 'percentage', value: '0.12', defaultValue: '0.12',
      minValue: 0, maxValue: 1, allowedValues: null, unit: 'rate',
      isSensitive: false, isDefault: true, requiresRestart: false,
      runtimeStatus: 'live', runtimeLabel: 'Live',
      runtimeSummary: 'Applied by the canonical booking settlement service.',
      editable: true, updatedAt: '2026-08-30T00:00:00.000Z',
    }], fees: [], escrow: [], cancellation: [],
    security: [], cache: [],
  },
};

// Cancellation policy shape — public read returns `data: { tiers,
// intro_text, ... }` (object, not array).
const CANCELLATION_POLICY_OBJECT = {
  id: 'POLICY-0003',
  version: 3,
  effective_from: '2026-08-01T00:00:00.000Z',
  effective_to: null,
  tiers: [
    { min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: '24 hours or more' },
    { min_hours_before: 6, max_hours_before: 24, refund_percent: 75, fee_percent: 25, label: '6 to 24 hours' },
    { min_hours_before: 0, max_hours_before: 6, refund_percent: 25, fee_percent: 75, label: 'Less than 6 hours' },
    { min_hours_before: -24, max_hours_before: 0, refund_percent: 0, fee_percent: 100, label: 'After scheduled time' },
  ],
  intro_text: 'Customer-facing cancellation wording currently uses the schedule below.',
  legal_disclaimer: 'Final treatment remains subject to the published booking terms and applicable law.',
  provider_no_show_credit_php: 300,
  is_active: true,
  created_at: '2026-07-25T00:00:00.000Z',
  created_by: FAKE_ADMIN.id,
  creator_name: 'Visual Baselines',
};
const CANCELLATION_POLICY_VERSION = {
  id: CANCELLATION_POLICY_OBJECT.id,
  version: CANCELLATION_POLICY_OBJECT.version,
  effective_from: CANCELLATION_POLICY_OBJECT.effective_from,
  effective_to: CANCELLATION_POLICY_OBJECT.effective_to,
  is_active: CANCELLATION_POLICY_OBJECT.is_active,
  created_at: CANCELLATION_POLICY_OBJECT.created_at,
  creator_name: CANCELLATION_POLICY_OBJECT.creator_name,
  tier_count: CANCELLATION_POLICY_OBJECT.tiers.length,
  provider_no_show_credit_php: CANCELLATION_POLICY_OBJECT.provider_no_show_credit_php,
  intro_text_preview: CANCELLATION_POLICY_OBJECT.intro_text,
};
const CANCELLATION_SETTINGS = [
  ['cancel_refund_over_24h', '100'],
  ['cancel_refund_2_to_24h', '100'],
  ['cancel_refund_1_to_2h', '90'],
  ['cancel_refund_30min_to_1h', '80'],
  ['cancel_refund_under_30min', '70'],
  ['cancel_refund_provider_arrived', '50'],
  ['cancel_refund_customer_noshow', '0'],
].map(([key, value]) => ({
  key, label: key, value, unit: '%', runtimeStatus: 'held', runtimeLabel: 'Launch hold',
  runtimeSummary: 'Frozen under E09 until one canonical cancellation source is approved.',
  editable: false,
}));

// Financials sub-endpoints — Each tab calls its own endpoint with a
// distinct object shape. The default empty-list mock crashes pages
// that destructure `data.aging.map(...)` etc.
const FINANCIALS_OVERVIEW = {
  gmv: 3_480_000, revenue: 417_600, refunds: 18_000,
  netRevenue: 399_600, bookingsCompleted: 11, averageTicket: 316_364,
};
const FINANCIALS_BREAKDOWN = [
  { label: 'Home Cleaning', revenue: 226_000, bookings: 7 },
  { label: 'Aircon Services', revenue: 191_600, bookings: 4 },
];
const FINANCIALS_ESCROW = {
  totalInEscrow: 430_000,
  pendingReleaseCount: 2,
  aging: [
    { bucket: '48-168h', count: 1, total: 280_000 },
    { bucket: '168h+', count: 1, total: 150_000 },
  ],
  pendingReleaseList: [
    {
      bookingId: 'BK-ESCROW-0001', customerName: 'Visual Customer',
      providerName: 'Cebu Home Care', amount: 280_000,
      completedAt: '2026-08-28T04:00:00.000Z',
    },
    {
      bookingId: 'BK-ESCROW-0002', customerName: 'BuildRight Cebu',
      providerName: 'Cebu Pro Cleaners', amount: 150_000,
      completedAt: '2026-08-20T04:00:00.000Z',
    },
  ],
};
const FINANCIALS_PAYMENTS = {
  paymentIntentsAvailable: true,
  gatewayRetriesAvailable: true,
  totalAttempts: 8,
  awaitingPaymentCount: 2,
  processingCount: 1,
  succeededCount: 2,
  failedCount: 1,
  refundedCount: 1,
  partiallyRefundedCount: 1,
  pendingGatewayRetries: 1,
  inProgressGatewayRetries: 0,
  permanentGatewayFailures: 1,
  recentIntents: [{
    id: 'PI-0001', bookingId: 'BK-0001', topupId: null,
    customerName: 'Visual Baseline', amountCentavos: 310_000,
    refundedAmountCentavos: 30_000, paymentMethod: 'gcash',
    status: 'partially_refunded', createdAt: '2026-08-30T05:00:00.000Z',
    updatedAt: '2026-08-30T08:00:00.000Z',
  }],
  gatewayRetries: [{
    id: 'RETRY-0001', bookingId: 'BK-0001', disputeId: 'DSP-0001',
    actionType: 'refund_from_escrow', amountCentavos: 30_000,
    status: 'failed_permanent', attempts: 5, maxAttempts: 5,
    nextRetryAt: '2026-08-30T08:00:00.000Z',
    lastAttemptedAt: '2026-08-30T08:00:00.000Z',
    lastError: 'Visual gateway failure requiring manual investigation.',
  }],
};
const FINANCIALS_PAYOUTS = {
  available: true, message: null,
  pendingCount: 0, pendingTotal: 0,
  internalReviewCount: 0, awaitingApprovalCount: 0,
  approvedAwaitingTransferCount: 0, processingCount: 0,
  todayCompletedCount: 0, todayCompletedTotal: 0,
  failedCount: 0,
  recentFailed: [],
};
const FINANCIALS_GUARANTEE = {
  currentBalance: 0, inflow30d: 0, outflow30d: 0, net30d: 0,
  avgMonthlyOutflow: 0, runwayMonths: null, needsReplenishment: false,
};
const FINANCIALS_RECONCILIATION = [{
  id: '11111111-1111-4111-8111-111111111111',
  snapshotDate: '2026-08-30',
  paymongoBalance: null,
  expectedTotal: 1_250_000,
  discrepancy: 0,
  alertSent: false,
}];
const FINANCIALS_BIR_OVERVIEW = {
  year: 2026, totalOutputVat: 0, totalVatPayable: 0,
  monthsFinalized: 0, monthlyReports: [], quarterlyBatches: [],
};

// Customer 360 profile shape — CustomerDetailPage hits
// /admin/customers/:id and destructures profile.fullName etc. The
// sub-tabs (bookings/payments/disputes/referrals/activity) hit
// separate endpoints which return arrays; only the top-level GET
// needs the object shape.
const CUSTOMER_PROFILE = {
  id: 'CU-0001', firstName: 'Visual', lastName: 'Baseline',
  fullName: 'Visual Baseline', phone: '+639170000001',
  email: 'visual@onservice.test', contactMasked: false, avatarUrl: null,
  isVerified: true, isActive: true, isFlaggedFraud: false,
  lastLoginAt: '2026-05-04T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  lifetimeBookings: 8, lifetimeSpent: 1_840_000,
  activeBookings: 1, openDisputes: 0,
  averageRatingGiven: 4.8, totalReviewsGiven: 6,
  activeRefreshSessions: 2,
  openSupportCases: 2, urgentSupportCases: 1, unassignedSupportCases: 0,
  supportOwnerNames: ['Mia Support'],
  addresses: [{
    id: 'ADDR-0001', label: 'Home',
    fullAddress: '12 Mango Avenue, Lahug', barangay: 'Lahug',
    city: 'Cebu City', province: 'Cebu', isDefault: true,
  }],
  sukiProviders: [{
    membershipId: 'SUKI-0001', providerId: 'PV-0001',
    providerBusinessName: 'Cebu Home Care', tier: 'verified',
    totalBookings: 4, totalSpent: 920_000, pointsBalance: 180,
    lastBookingAt: '2026-08-20T04:00:00.000Z',
  }],
};

// Provider 360 profile shape — ProviderDetailPage hits
// /admin/providers/:id and destructures provider fields. Same pattern
// as customer.
const PROVIDER_PROFILE = {
  id: 'PV-0001', userId: 'U-0001',
  businessName: 'Cebu Home Care',
  description: 'Verified home cleaning and maintenance team serving Metro Cebu.',
  status: 'approved', tier: 'verified',
  averageRating: 4.9, totalReviews: 114, totalJobsCompleted: 126,
  serviceRadiusKm: 15, yearsExperience: 7,
  vettingAnswers: {
    mainSkills: 'Home cleaning, post-construction cleanup, and minor repairs',
    hasOwnTools: true, businessType: 'Registered sole proprietorship',
    yearStarted: '2019', teamSize: '6',
    fullAddress: 'Lahug, Cebu City, Cebu',
    credentials: 'TESDA-trained team lead', registrations: 'DTI registered',
    references: [],
  },
  city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
  activeRefreshSessions: 3,
  openSupportCases: 2, urgentSupportCases: 1, unassignedSupportCases: 1,
  supportOwnerNames: ['Mia Support'], pendingServiceAreaChanges: 1,
  user: {
    id: 'U-0001', fullName: 'Maria Dela Cruz', phone: '+639180000001',
    email: 'provider@onservice.test', contactMasked: false, avatarUrl: null,
    isVerified: true, isActive: true,
    lastLoginAt: '2026-08-30T06:30:00.000Z',
  },
  documents: {
    nbiClearanceUrl: '/api/v1/admin/providers/PV-0001/documents/nbi', nbiExpiryDate: '2027-01-15',
    nbiExpiryNotified: false, avatarUrl: null, governmentIdUrl: null,
    governmentIdBackUrl: null, selfieUrl: null,
  },
  categories: [{ id: 'CAT-1', name: 'Home Cleaning', basePrice: 250_000 }],
  services: [{
    id: 'SVC-1', name: 'Post-construction cleanup', categoryName: 'Home Cleaning',
    pricingType: 'fixed', basePrice: 500_000, hourlyRate: null,
    unitLabel: null, unitPrice: null, minPrice: null, maxPrice: null,
  }],
  serviceAreas: [{ id: 'AREA-1', name: 'Cebu City', isPrimary: true }],
  portfolio: [],
  certifications: [
    {
      id: 'CERT-0001', name: 'Electrical Installation NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-EI-1001', issuedDate: '2025-01-15', expiryDate: '2030-01-15',
      isVerified: true, verifiedAt: '2025-02-01T00:00:00.000Z', hasDocument: true,
      documentUrl: '/api/v1/admin/providers/PV-0001/certifications/CERT-0001/document',
      createdAt: '2025-01-15T00:00:00.000Z',
    },
    {
      id: 'CERT-0002', name: 'Plumbing NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-PL-1002', issuedDate: '2026-03-10', expiryDate: '2031-03-10',
      isVerified: false, verifiedAt: null, hasDocument: true,
      documentUrl: '/api/v1/admin/providers/PV-0001/certifications/CERT-0002/document',
      createdAt: '2026-03-10T00:00:00.000Z',
    },
    {
      id: 'CERT-0003', name: 'Air Conditioning Servicing NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-AC-1003', issuedDate: '2021-05-20', expiryDate: '2025-05-20',
      isVerified: false, verifiedAt: null, hasDocument: true,
      documentUrl: '/api/v1/admin/providers/PV-0001/certifications/CERT-0003/document',
      createdAt: '2021-05-20T00:00:00.000Z',
    },
    {
      id: 'CERT-0004', name: 'Basic Occupational Safety and Health', issuingBody: 'DOLE',
      certificateNumber: null, issuedDate: '2026-06-01', expiryDate: null,
      isVerified: false, verifiedAt: null, hasDocument: false, documentUrl: null,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  ],
  notes: [],
};

// Booking detail shape — BookingDetailPage hits /admin/bookings/:id.
// Address is nested { full, barangay, city, province } not flat.
// Pre-fix the flat shape made the page render ", ," because the
// outer string was truthy but inner .full/.barangay/.city/.province
// were all undefined (BUG-PHASE39-03).
const BOOKING_DETAIL = {
  id: 'BK-0001', status: 'confirmed', escrowStatus: 'held',
  scheduledAt: '2026-09-01T02:00:00.000Z', completedAt: null,
  confirmedAt: '2026-08-30T08:00:00.000Z', cancelledAt: null,
  cancellationReason: null, pricingMode: 'fixed',
  servicePrice: 280_000, serviceFee: 30_000, totalAmount: 310_000,
  conversationId: 'CONV-0001',
  category: { id: 'CAT-1', name: 'Home Cleaning' },
  subcategory: { id: 'SUB-1', name: 'Post-construction cleanup' },
  address: {
    full: '12 Mango Avenue, Lahug, Cebu City, Cebu',
    barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
  },
  customer: {
    id: 'CU-0001', fullName: 'Visual Baseline', phone: '+639170000001',
    email: 'visual@onservice.test', avatarUrl: null,
    lifetimeBookings: 8, averageRatingGiven: 4.8,
  },
  provider: {
    id: 'PV-0001', userId: 'U-0001', businessName: 'Cebu Home Care',
    tier: 'verified', fullName: 'Maria Dela Cruz', phone: '+639180000001',
    avatarUrl: null, rating: 4.9, lifetimeJobs: 126,
  },
  createdAt: '2026-05-01T00:00:00.000Z',
};

// Dispute detail shape — DisputeDetailPage hits /admin/disputes/:id.
const DISPUTE_DETAIL = {
  id: 'DSP-0001', bookingId: 'BK-0001',
  status: 'under_review', tier: 2, type: 'service_quality',
  description: 'The completed cleanup did not cover the agreed kitchen scope.',
  filedBy: 'CU-0001', filedAt: '2026-08-30T06:00:00.000Z',
  ageHours: 18, priorityScore: 76, resolvedAt: null, resolvedBy: null,
  resolutionType: null, refundAmount: null, decisionNotes: null,
  internalNotes: null,
  providerResponse: 'The provider requests review of the before-and-after proof.',
  providerRespondedAt: '2026-08-30T08:00:00.000Z', assignedTo: null,
  booking: {
    id: 'BK-0001', status: 'disputed', totalAmount: 310_000,
    scheduledAt: '2026-08-29T02:00:00.000Z',
    completedAt: '2026-08-29T06:00:00.000Z',
    servicePrice: 280_000, serviceFee: 30_000,
  },
  customer: {
    id: 'CU-0001', fullName: 'Visual Baseline', phone: '+639170000001',
    avatarUrl: null, disputesLast90Days: 1,
    disputesFavoredCustomerLast90Days: 0, pattern: 'OK',
  },
  provider: {
    id: 'PV-0001', userId: 'U-0001', businessName: 'Cebu Home Care',
    tier: 'verified', fullName: 'Maria Dela Cruz', avatarUrl: null,
    disputesLast90Days: 2, disputesLostLast90Days: 0, pattern: 'OK',
  },
  evidence: [],
};

// Populated list and operational-workspace contracts. A visual "default"
// baseline must prove that the real row/card/link layout renders. Returning
// the same empty list as the explicit empty-state test makes the two images
// identical and leaves the most important production surface untested.
const CUSTOMER_LIST_RECORD = {
  id: 'CU-0001', phone: '+639170000001', email: 'visual@onservice.test',
  firstName: 'Visual', lastName: 'Baseline', status: 'active', isActive: true,
  isFlaggedFraud: false, contactMasked: false, totalBookings: 8,
  totalSpent: 1_840_000, activeBookings: 1, totalDisputes: 1,
  openDisputes: 0, openSupportTickets: 1, createdAt: '2026-01-01T00:00:00.000Z',
};
const PROVIDER_LIST_RECORD = {
  id: 'PV-0001', userId: 'U-0001', businessName: 'Cebu Home Care',
  fullName: 'Maria Dela Cruz', phone: '+639180000001',
  email: 'provider@onservice.test', status: 'approved', tier: 'verified',
  rating: 4.9, totalReviews: 114, totalJobs: 126, serviceRadiusKm: 15,
  isAvailable: true, city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const BOOKING_LIST_RECORD = {
  id: 'BK-0001', customerId: 'CU-0001', providerId: 'PV-0001',
  categoryId: 'CAT-1', status: 'in_progress', escrowStatus: 'held',
  totalAmount: 310_000, city: 'Cebu City',
  scheduledAt: '2026-09-01T02:00:00.000Z', customerName: 'Visual Baseline',
  providerName: 'Cebu Home Care', categoryName: 'Home Cleaning',
  createdAt: '2026-08-30T00:00:00.000Z', openSupportTickets: 1,
  unassignedSupportTickets: 0, urgentSupportTickets: 1,
  supportOwnerNames: 'Maria Santos', openDisputes: 0, pastScheduled: false,
  latitude: 10.3157, longitude: 123.8854,
};
const BUSINESS_ACCOUNT_RECORD = {
  id: 'BA-0001', companyName: 'Cebu Builders Cooperative',
  businessType: 'other', city: 'Cebu City', province: 'Cebu',
  contactPerson: 'Ana Reyes', contactEmail: 'operations@cebubuilders.test',
  contactPhone: '+639190000001', status: 'active', paymentTerms: 'net_15',
  volumeDiscountRate: 0.05, monthlyCreditLimit: 2_000_000,
  ownerName: 'Ana Reyes', managerName: 'Visual Baselines',
  createdAt: '2026-06-01T00:00:00.000Z',
};
const AUDIT_RECORD = {
  id: 'AUDIT-0001', source: 'admin_actions', userId: FAKE_ADMIN.id,
  userEmail: FAKE_ADMIN.email, userRole: 'super_admin',
  action: 'booking_reassigned', entityType: 'booking', entityId: 'BK-0001',
  oldValues: { providerId: null }, newValues: { providerId: 'PV-0001' },
  ipAddress: '127.0.0.1', userAgent: 'Playwright visual baseline',
  reason: 'Assigned verified Cebu provider after customer support review.',
  createdAt: '2026-08-30T08:15:00.000Z',
};
const DSR_RECORD = {
  id: 'DSR-0001', userId: 'CU-0001', userEmail: 'visual@onservice.test',
  userRole: 'customer', providerProfileId: null,
  requestType: 'access', status: 'in_progress',
  receivedAt: '2026-08-25T04:00:00.000Z', dueAt: '2026-09-09T04:00:00.000Z',
  completedAt: null, handledBy: FAKE_ADMIN.id,
  userMessage: 'Please provide a copy of the personal data linked to my account.',
  adminNotes: 'Identity verification completed; export preparation in progress.',
  responsePayloadUrl: null, rejectionReason: null, daysUntilDue: 9, isOverdue: false,
};
const CONSENT_VERSION_BUNDLE = {
  allowedConsentTypes: [
    'privacy_policy', 'terms_of_service', 'marketing_consent', 'ic_agreement',
    'cookie_policy', 'data_processing', 'biometric_consent',
  ],
  summaries: [{
    consentType: 'privacy_policy', version: '2026.08',
    effectiveDate: '2026-08-01', activeUsers: 842, totalRecords: 917,
    lastUpdated: '2026-08-30T00:00:00.000Z',
  }],
  published: [{
    id: 'CONSENT-0001', consentType: 'privacy_policy', version: '2026.08',
    effectiveAt: '2026-08-01T00:00:00.000Z',
    changeSummary: 'Clarified provider verification and booking support processing.',
    material: false, publishedBy: FAKE_ADMIN.id,
    publishedAt: '2026-07-28T00:00:00.000Z',
  }],
};
const SERVICE_AREA_RECORD = {
  id: 'AREA-CEBU', name: 'Metro Cebu', slug: 'metro-cebu',
  city: 'Cebu City', province: 'Cebu', region: 'Central Visayas',
  zipCodes: ['6000', '6014', '6015'], centerLat: 10.3157, centerLng: 123.8854,
  radiusKm: 25, status: 'active', launchDate: '2026-09-01',
  launchedAt: '2026-08-15T00:00:00.000Z', minProvidersToLaunch: 20,
  activeProviderCount: 37, activeCustomerCount: 842, totalBookings: 126,
  isDefault: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const MARKETING_OVERVIEW = {
  totalSpendCentavos: 125_000, totalSignups: 84,
  totalRevenueCentavos: 486_000, aggregateCpaCentavos: 1_488,
  aggregateRoiPercent: 288.8,
  channelBreakdown: [{
    channel: 'referral', spendCentavos: 125_000, signups: 84,
    cpaCentavos: 1_488, revenueCentavos: 486_000, roiPercent: 288.8,
  }],
};
const NOTIFICATION_TEMPLATE_RECORD = {
  id: 'NT-0001', slug: 'booking-provider-en-route',
  titleTemplate: 'Your provider is on the way',
  bodyTemplate: '{{provider_name}} is travelling to {{service_address}}.',
  type: 'booking_update', channel: 'push', isActive: true,
  variables: ['provider_name', 'service_address'],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};
const RECURRING_RECORD = {
  id: 'REC-0001', customerId: 'CU-0001', providerId: 'PV-0001',
  categoryId: 'CAT-1', frequency: 'weekly', preferredDayName: 'Friday',
  preferredTime: '09:00', city: 'Cebu City', province: 'Cebu',
  totalAmount: 280_000, status: 'active', nextBookingDate: '2026-09-04',
  totalInstances: 6, createdAt: '2026-07-01T00:00:00.000Z',
  customerName: 'Visual Baseline', categoryName: 'Home Cleaning',
};

export const test = base.extend<VisualFixtureOptions>({
  authenticated: [true, { option: true }],
  page: async ({ page, authenticated }, use) => {
    // The header exposes a live Manila clock at 2xl widths. Freeze browser
    // time so strict detail-page screenshots compare the application rather
    // than the minute in which CI happened to reach the test.
    await page.clock.setFixedTime(new Date('2026-08-30T20:00:00.000Z'));

    // Auth hydration intentionally skips /auth/me when the readable CSRF
    // session hint is absent. Seed that browser-only hint before application
    // JavaScript runs, otherwise every protected visual test silently captures
    // the login page despite its mocked /auth/me response.
    if (authenticated) {
      await page.addInitScript(() => {
        document.cookie = 'admin_csrf=visual-baseline-session; path=/; SameSite=Strict';
      });
    }

    // 1. Hard-mock /auth/me so the auth-store hydrate() succeeds.
    await page.route('**/api/v1/auth/me', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: FAKE_ADMIN }),
        });
      } else {
        route.continue();
      }
    });

    // 2a. Public cancellation-policy endpoint lives outside /admin.
    await page.context().route('**/api/v1/settings/cancellation-policy', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: CANCELLATION_POLICY_OBJECT }),
        });
      } else {
        route.continue();
      }
    });

    // 2a-bis. Other non-/admin endpoints called directly from pages:
    //   /catalog/**       — CatalogPage
    //   /staff/**         — StaffRolesPage
    // These return safe empty payloads. PayoutsPage and DisputesPage own
    // explicit success/loading/empty/error route contracts in their specs;
    // registering a broad fixture route for those endpoints can mask the
    // state-specific route and create false visual baselines.
    const NON_ADMIN_PATTERNS = [
      '**/api/v1/catalog/**',
      '**/api/v1/staff/**',
    ];
    for (const pattern of NON_ADMIN_PATTERNS) {
      await page.context().route(pattern, (route) => {
        if (route.request().method() !== 'GET') {
          route.continue();
          return;
        }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [],
            pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
          }),
        });
      });
    }

    // 2b. Default-mock every other admin-API GET. Dashboard KPI endpoint
    //    gets the object shape; everything else gets the empty paginated
    //    list shape.
    // Context-level defaults deliberately sit below each spec's page-level
    // routes. This guarantees that a state-specific loading, empty, or error
    // mock wins instead of being silently masked by the shared fallback.
    await page.context().route('**/api/v1/admin/**', (route) => {
      if (route.request().method() !== 'GET') {
        route.continue();
        return;
      }
      const url = route.request().url();
      const requestUrl = new URL(url);
      const path = requestUrl.pathname;
      let body: unknown;
      if (url.includes('/dashboard/kpis')) {
        body = { success: true, data: KPI_OBJECT };
      } else if (url.includes('/dashboard/acquisition-funnel')) {
        body = { success: true, data: FUNNEL_OBJECT };
      } else if (url.includes('/admin/financials/overview')) {
        body = { success: true, data: FINANCIALS_OVERVIEW };
      } else if (url.includes('/admin/financials/revenue/by-category')) {
        body = { success: true, data: FINANCIALS_BREAKDOWN };
      } else if (url.includes('/admin/financials/revenue/by-city')) {
        body = { success: true, data: [{ label: 'Cebu City', revenue: 417_600, bookings: 11 }] };
      } else if (url.includes('/admin/financials/revenue/by-tier')) {
        body = { success: true, data: [{ label: 'Verified', revenue: 417_600, bookings: 11 }] };
      } else if (url.includes('/admin/financials/revenue/by-payment')) {
        body = {
          success: true,
          data: {
            rows: [{ label: 'GCash', revenue: 417_600, bookings: 11 }],
            degraded: false,
            message: null,
          },
        };
      } else if (url.includes('/admin/financials/escrow')) {
        body = { success: true, data: FINANCIALS_ESCROW };
      } else if (url.includes('/admin/financials/payments')) {
        body = { success: true, data: FINANCIALS_PAYMENTS };
      } else if (url.includes('/admin/financials/payouts')) {
        body = { success: true, data: FINANCIALS_PAYOUTS };
      } else if (url.includes('/admin/financials/guarantee-fund')) {
        body = { success: true, data: FINANCIALS_GUARANTEE };
      } else if (url.includes('/admin/bir/reconciliation/recent')) {
        body = { success: true, data: FINANCIALS_RECONCILIATION };
      } else if (url.includes('/admin/financials/bir-2307/overview')
              || url.includes('/admin/bir/overview')) {
        body = { success: true, data: FINANCIALS_BIR_OVERVIEW };
      } else if (path === '/api/v1/admin/analytics/cohorts') {
        body = {
          success: true,
          data: [{
            cohort: '2026-07', cohortSize: 128,
            periods: [
              { period: 0, value: 128, percentage: 100 },
              { period: 1, value: 79, percentage: 61.7 },
            ],
          }],
        };
      } else if (path === '/api/v1/admin/audit-log') {
        body = {
          success: true,
          data: [AUDIT_RECORD],
          pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/compliance/consent-versions') {
        body = { success: true, data: CONSENT_VERSION_BUNDLE };
      } else if (path === '/api/v1/admin/compliance/dsr') {
        body = { success: true, data: { rows: [DSR_RECORD], total: 1 } };
      } else if (path === '/api/v1/admin/marketing/overview') {
        body = { success: true, data: MARKETING_OVERVIEW };
      } else if (path === '/api/v1/admin/service-areas/stats') {
        body = {
          success: true,
          data: {
            totalAreas: 1, activeAreas: 1, totalProviders: 37,
            totalWaitlist: 12, areasByStatus: { active: 1 },
          },
        };
      } else if (path === '/api/v1/admin/service-area-changes') {
        body = { success: true, data: [] };
      } else if (url.match(/\/admin\/customers\/[^/]+\/disputes/)) {
        body = {
          success: true,
          data: {
            rows: [{
              id: 'DSP-0001', bookingId: 'BK-0001', providerId: 'PV-0001',
              providerBusinessName: 'Cebu Home Care', type: 'quality', status: 'under_review',
              resolutionType: null, refundAmount: 0, filedById: 'U-0001',
              filedByRole: 'provider', filedByName: 'Cebu Home Care',
              createdAt: '2026-08-30T04:00:00.000Z',
            }],
            total: 1, page: 1, pageSize: 20,
            fraudPattern: {
              disputesInWindow: 0, windowDays: 30, favorProviderRate: null,
              flagged: false, reason: null,
            },
          },
        };
      } else if (url.match(/\/admin\/providers\/[^/]+\/notes/)) {
        body = {
          success: true,
          data: [{
            id: 'NOTE-0001', providerId: 'PV-0001', authorId: 'admin-visual',
            authorName: 'Mia Support', category: 'quality',
            body: 'Customer callback completed. Evidence review remains open.',
            pinned: true, createdAt: '2026-08-30T04:00:00.000Z',
            updatedAt: '2026-08-30T04:00:00.000Z',
          }],
        };
      } else if (url.match(/\/admin\/providers\/[^/]+\/staff/)) {
        body = {
          success: true,
          data: [
            {
              id: 'STAFF-0001', userId: 'U-STAFF-0001', userName: 'Joel Santos',
              roleTitle: 'Team lead', status: 'approved',
              invitePhone: '+63 9XX XXX 4321', inviteEmail: 'j•••@example.com',
              contactMasked: true, adminDecisionReason: null, isAssignable: true,
              createdAt: '2026-06-01T00:00:00.000Z',
              performance: { totalJobs: 38, totalReviews: 31, averageRating: 4.87 },
            },
            {
              id: 'STAFF-0002', userId: null, userName: null,
              roleTitle: 'Aircon technician', status: 'pending_review',
              invitePhone: '+63 9XX XXX 8765', inviteEmail: null,
              contactMasked: true, adminDecisionReason: null, isAssignable: false,
              createdAt: '2026-08-28T00:00:00.000Z',
              performance: { totalJobs: 0, totalReviews: 0, averageRating: 0 },
            },
          ],
        };
      } else if (url.match(/\/admin\/customers\/[^/]+(\?|$)/) && !url.includes('/customers/CU-0001/')) {
        // /admin/customers/:id (no path suffix) — profile object
        body = { success: true, data: CUSTOMER_PROFILE };
      } else if (url.match(/\/admin\/providers\/[^/]+\/profile/)) {
        body = { success: true, data: PROVIDER_PROFILE };
      } else if (url.match(/\/admin\/providers\/[^/]+(\?|$)/) && !url.match(/\/providers\/[^/]+\//)) {
        body = { success: true, data: PROVIDER_PROFILE };
      } else if (url.match(/\/admin\/bookings\/[^/]+(\?|$)/) && !url.match(/\/bookings\/[^/]+\//)) {
        body = { success: true, data: BOOKING_DETAIL };
      } else if (url.match(/\/admin\/disputes\/[^/]+(\?|$)/) && !url.match(/\/disputes\/[^/]+\//)) {
        body = { success: true, data: DISPUTE_DETAIL };
      } else if (path === '/api/v1/admin/bookings') {
        body = {
          success: true,
          data: [BOOKING_LIST_RECORD],
          summary: {
            totalBookings: 1, activeBookings: 1, unassignedActive: 0,
            openSupportBookings: 1, disputedBookings: 0, pastScheduledBookings: 0,
          },
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/providers') {
        body = {
          success: true,
          data: [PROVIDER_LIST_RECORD],
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/customers') {
        body = {
          success: true,
          data: [CUSTOMER_LIST_RECORD],
          summary: { totalCustomers: 1, activeAccounts: 1, inactiveAccounts: 0, fraudFlagged: 0 },
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/business-accounts') {
        body = {
          success: true,
          data: [BUSINESS_ACCOUNT_RECORD],
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/service-areas') {
        body = {
          success: true,
          data: [SERVICE_AREA_RECORD],
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/notification-templates') {
        body = {
          success: true,
          data: [NOTIFICATION_TEMPLATE_RECORD],
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (path === '/api/v1/admin/recurring') {
        body = {
          success: true,
          data: [RECURRING_RECORD],
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        };
      } else if (url.match(/\/admin\/settings(\?|$)/)) {
        // /admin/settings (no path suffix) — bundle endpoint
        body = { success: true, data: SETTINGS_BUNDLE };
      } else if (path === '/api/v1/admin/settings/cancellation') {
        body = { success: true, data: CANCELLATION_SETTINGS };
      } else if (path === '/api/v1/admin/cancellation-policies') {
        body = { success: true, data: [CANCELLATION_POLICY_VERSION] };
      } else if (url.includes('/admin/cancellation-policies') && url.match(/\/\d+($|\?)/)) {
        // /admin/cancellation-policies/:version — single object
        body = { success: true, data: CANCELLATION_POLICY_OBJECT };
      } else {
        body = {
          success: true,
          data: [],
          pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
          meta: { total: 0, unread: 0, page: 1, pageSize: 20 },
        };
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    // 3. Wait for networkidle after every goto so screenshots capture
    //    a settled state instead of a mid-fetch spinner. 3s timeout is
    //    enough for the React Query useQuery hooks to resolve against
    //    the synchronous fulfill above.
    const origGoto = page.goto.bind(page);
    page.goto = async (url, opts) => {
      const result = await origGoto(url, opts);
      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch {
        /* some pages keep long-poll websockets open; screenshot
           algorithm has its own visual-stability check */
      }
      return result;
    };

    await use(page);
  },
});

export { expect };
