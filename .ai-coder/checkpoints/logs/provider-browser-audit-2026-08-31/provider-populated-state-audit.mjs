import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.join(here, 'populated-state-screenshots');

const providerUser = {
  id: 'provider-browser-audit', phone: '+639171234567', email: 'provider.audit@invalid.example',
  firstName: 'Roberto', lastName: 'Santos', role: 'provider', avatarUrl: null,
};

const staffUser = {
  id: 'staff-user-1', phone: '+639181234567', email: 'staff.audit@invalid.example',
  firstName: 'Ana', lastName: 'Reyes', role: 'provider_staff', avatarUrl: null,
};

const service = {
  id: 'provider-service-1', providerId: 'provider-browser-audit', subcategoryId: 'subcategory-1',
  subcategoryName: 'Aircon Cleaning', categoryId: 'category-1', categoryName: 'Air Conditioning',
  categorySlug: 'air-conditioning', pricingType: 'fixed', basePrice: 150000, isActive: true,
};

const provider = {
  id: 'provider-browser-audit', userId: providerUser.id, businessName: 'Santos Home Services',
  tier: 'verified', status: 'approved', bio: 'Licensed technician focused on documented, careful work.',
  rating: 4.8, totalJobs: 47, acceptanceRate: 0.93, responseTimeMinutes: 12,
  yearsExperience: 8, serviceRadiusKm: 20, isAvailable: true,
  latitude: 10.3157, longitude: 123.8854, city: 'Cebu City', province: 'Cebu',
  createdAt: '2025-01-10T00:00:00.000Z', services: [service],
  schedule: [
    { id: 'schedule-1', dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
    { id: 'schedule-2', dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isAvailable: true },
  ],
  ratings: { overall: 4.8, totalReviews: 22, quality: 4.9, punctuality: 4.7, professionalism: 4.8, communication: 4.8, value: 4.7 },
  portfolio: [], certifications: [], commissionRate: 0.13,
};

const booking = {
  id: 'audit-booking', bookingType: 'fixed_price', status: 'in_progress',
  servicePrice: 150000, serviceFee: 7500, totalAmount: 157500,
  scheduledAt: '2026-08-31T08:00:00.000Z', createdAt: '2026-08-28T03:00:00.000Z',
  workStartedAt: '2026-08-31T08:05:00.000Z', completedAt: null, confirmedAt: null,
  customerName: 'Paolo Garcia', categoryId: 'category-1', subcategoryId: 'subcategory-1',
  categoryName: 'Air Conditioning', serviceName: 'Aircon Cleaning',
  description: 'Clean one split-type unit and document the finished work.',
  address: '88 Banilad Road', barangay: 'Banilad', city: 'Mandaue City', province: 'Cebu',
  latitude: 10.335, longitude: 123.91, performerStaffId: 'staff-1',
  providerBeforePhotos: [], providerAfterPhotos: [], jobPhotos: [],
  intakeAnswers: { unit_count: 1, wall_mounted: true },
};

const proof = {
  booking: { id: booking.id, status: booking.status, description: booking.description, workStartedAt: booking.workStartedAt, workCompletedAt: null, completedAt: null, confirmedAt: null, completionNotes: null },
  readiness: { stage: 'in_progress', readyForProviderCompletion: false, minimumTimeOnSiteMinutes: 30, afterPhotosRequired: 2, blockers: [{ code: 'CHECKLIST', message: 'Finish the required checklist.' }], qualityFlags: [] },
  checklist: { templateVersion: 1, shownAt: '2026-08-31T08:05:00.000Z', totalItems: 2, requiredItems: 2, completedRequiredItems: 1, complete: false, items: [] },
  photos: [{ id: 'photo-before-1', photoType: 'before', uploadedByRole: 'provider', source: 'canonical', uploadedAt: '2026-08-31T08:06:00.000Z' }],
  signatures: { identityCaveat: 'Provider-session capture is not verified customer identity.', records: [] },
  changeOrders: [], communications: { chatMessageCount: 2, supportTickets: [] }, dispute: null,
};

const staff = {
  id: 'staff-1', userId: 'staff-user-1', userName: 'Ana Reyes', roleTitle: 'Aircon technician',
  status: 'approved', invitePhone: '+639181234567', inviteEmail: null, adminDecisionReason: null,
  isAssignable: true, createdAt: '2026-06-01T00:00:00.000Z',
  performance: { totalJobs: 12, totalReviews: 8, averageRating: 4.8 },
};

const ticket = {
  id: 'audit-ticket', ticket_number: 'SUP-2026-0812', type: 'payment_issue', status: 'in_progress',
  priority: 'medium', subject: 'Payment release question',
  description: 'Please confirm when the completed booking will become available for withdrawal.',
  booking_id: booking.id, created_at: '2026-08-30T02:00:00.000Z', updated_at: '2026-08-31T02:00:00.000Z',
  message_count: '1', agent_first_name: 'Mia',
};

const client = {
  customerId: 'audit-customer', customerName: 'Paolo Garcia', jobCount: 4, completedCount: 3,
  lastJobAt: '2026-08-31T09:00:00.000Z', totalJobValue: 525000,
};

const dispute = {
  id: 'audit-dispute', bookingId: booking.id, filedBy: 'customer-1', type: 'substandard',
  description: 'The customer asked support to review the documented work quality.', status: 'open', tier: 1,
  assignedTo: null, resolutionType: null, refundAmount: 0, refundPercent: null, decisionNotes: null,
  providerResponse: null, providerRespondedAt: null, autoResolved: false, resolvedAt: null, resolvedBy: null,
  createdAt: '2026-08-31T10:00:00.000Z', updatedAt: '2026-08-31T10:00:00.000Z',
  customerName: 'Paolo Garcia', providerName: 'Santos Home Services', evidence: [],
};

const routes = [
  ['/dashboard', 'Hello, Roberto'],
  ['/jobs', 'Jobs'],
  ['/earnings', 'AVAILABLE BALANCE'],
  ['/provider-profile', 'Your Provider Profile'],
  ['/provider/account-management', 'Account & Data'],
  ['/provider/availability', 'Availability Settings'],
  ['/provider/calendar', 'My Schedule'],
  ['/provider/certifications', 'Certifications'],
  ['/provider/clients', 'Clients'],
  ['/provider/clients/audit-customer', 'Paolo Garcia'],
  ['/provider/disputes', 'Disputes'],
  ['/provider/dispute/audit-dispute', 'Dispute'],
  ['/provider/help', 'Help'],
  ['/provider/insights', 'Insights'],
  ['/provider/services', 'My Services'],
  ['/provider/job/audit-booking', 'Job Details'],
  ['/provider/job/audit-booking/change-order', 'Change Order'],
  ['/provider/job/audit-booking/checklist', 'Service Checklist'],
  ['/provider/job/audit-booking/complete', 'Complete Job'],
  ['/provider/job/audit-booking/navigate', 'Navigate'],
  ['/provider/job/audit-booking/photos', 'Job Photos'],
  ['/provider/job/audit-booking/quote', 'Quote'],
  ['/provider/job/active?bookingId=audit-booking', 'Service in progress'],
  ['/provider/chat/audit-booking', 'Paolo Garcia'],
  ['/provider/leads', 'Job Requests'],
  ['/provider/notification-settings', 'Notification preferences'],
  ['/provider/notifications', 'Notifications'],
  ['/provider/payout-settings', 'Withdrawal Preferences'],
  ['/provider/portfolio', 'Portfolio'],
  ['/provider/quote-templates', 'Quote Templates'],
  ['/provider/reminders', 'Reminders'],
  ['/provider/team', 'My Team'],
  ['/provider/withdraw', 'Withdraw Funds'],
  ['/provider/service-area', 'Current approved coverage'],
  ['/provider/reviews', 'My Reviews'],
  ['/provider/payouts', 'Payout History'],
  ['/provider/schedule', 'Weekly Schedule'],
  ['/provider/settings', 'Settings'],
  ['/provider/skills', 'My Services'],
  ['/provider/standards', 'Standards'],
  ['/provider/suki-customers', 'Suki'],
  ['/provider/tier-progression', 'Tier'],
  ['/support', 'Your requests'],
  ['/support/new', 'New request'],
  ['/support/audit-ticket', 'Payment release question'],
];

const staffRoutes = [
  ['/staff/jobs', 'Assigned field work'],
  ['/staff/job/audit-booking', 'Job Details'],
  ['/staff/job/audit-booking/checklist', 'Service Checklist'],
  ['/staff/job/audit-booking/complete', 'Complete Job'],
  ['/staff/invites', 'Team Invitations'],
  ['/support', 'Your requests'],
  ['/support/new', 'New request'],
  ['/support/audit-ticket', 'Payment release question'],
];

function envelope(data, extra = {}) {
  return { success: true, data, ...extra };
}

function responseFor(url) {
  const { pathname } = url;
  if (pathname === '/api/v1/config') return envelope({});
  if (pathname === '/api/v1/providers/me/nbi-status') return envelope({ status: 'valid', expiresAt: '2028-01-01T00:00:00.000Z' });
  if (pathname === '/api/v1/providers/me') return envelope(provider);
  if (pathname === '/api/v1/providers/me/services') return envelope([service]);
  if (pathname === '/api/v1/providers/me/certifications') return envelope([]);
  if (pathname === '/api/v1/providers/me/portfolio') return envelope([]);
  if (pathname === '/api/v1/providers/me/clients') return envelope([client]);
  if (pathname === `/api/v1/providers/me/clients/${client.customerId}`) return envelope({
    ...client,
    bookings: [{ id: booking.id, status: booking.status, servicePrice: booking.servicePrice, categoryName: booking.categoryName, createdAt: booking.createdAt }],
    notes: [{ id: 'client-note-1', customerId: client.customerId, body: 'Prefers afternoon appointments.', createdAt: '2026-08-20T00:00:00.000Z' }],
    reminders: [{ id: 'reminder-1', customerId: client.customerId, customerName: client.customerName, title: 'Follow up after service', dueDate: '2026-09-07', status: 'pending', createdAt: '2026-08-31T00:00:00.000Z' }],
  });
  if (pathname === '/api/v1/providers/me/reminders') return envelope([{ id: 'reminder-1', customerId: client.customerId, customerName: client.customerName, title: 'Follow up after service', dueDate: '2026-09-07', status: 'pending', createdAt: '2026-08-31T00:00:00.000Z' }]);
  if (pathname === '/api/v1/providers/me/quote-templates') return envelope([{ id: 'template-1', name: 'Aircon deep clean', categoryId: service.categoryId, subcategoryId: service.subcategoryId, createdAt: '2026-08-20T00:00:00.000Z', items: [{ id: 'template-item-1', description: 'Deep cleaning', quantity: 1, unit: 'unit', unitPrice: 150000, itemType: 'labor', sortOrder: 0 }] }]);
  if (pathname === '/api/v1/providers/me/insights') return envelope([{ categoryId: service.categoryId, categoryName: service.categoryName, jobCount: 12, completedCount: 11, completionRate: 91.7, completedValue: 1650000, avgRating: 4.8 }]);
  if (pathname === '/api/v1/providers/me/tier-progression') return envelope({
    currentTier: 'verified', currentCommission: 13, progressionTrack: 'standard', promotionMode: 'admin_review',
    nextTier: { tier: 'pro', minJobs: 50, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 11, benefits: ['Lower commission'] },
    progress: { totalJobs: 47, rating: 4.8, hasCertification: true, openDisputeCount: 0 },
    requirements: { jobs: { current: 47, required: 50, met: false }, rating: { current: 4.8, required: 4.7, met: true }, certification: { required: true, met: true }, disputes: { required: true, current: 0, met: true } },
    allTiers: [
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: ['Marketplace access'] },
      { tier: 'verified', minJobs: 10, minRating: 4.5, requiresCertification: true, requiresZeroDisputes: false, commission: 13, benefits: ['Verified badge'] },
      { tier: 'pro', minJobs: 50, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 11, benefits: ['Lower commission'] },
    ],
    progressionTiers: [
      { tier: 'new', minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false, commission: 15, benefits: ['Marketplace access'] },
      { tier: 'verified', minJobs: 10, minRating: 4.5, requiresCertification: true, requiresZeroDisputes: false, commission: 13, benefits: ['Verified badge'] },
      { tier: 'pro', minJobs: 50, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true, commission: 11, benefits: ['Lower commission'] },
    ],
  });
  if (pathname === '/api/v1/providers/me/schedule') return envelope(provider.schedule);
  if (pathname === '/api/v1/providers/me/calendar') return envelope({ jobs: [booking], overrides: [] });
  if (pathname === '/api/v1/providers/me/availability/status') return envelope({ isAvailable: true });
  if (pathname === '/api/v1/providers/me/availability/overrides') return envelope([]);
  if (pathname === '/api/v1/providers/me/earnings/summary') return envelope({ earnedToday: 130500, earnedThisWeek: 425000, earnedThisMonth: 1458000, pendingEscrow: 150000, jobsToday: 1, jobsThisWeek: 4, jobsThisMonth: 15 });
  if (pathname === '/api/v1/providers/me/earnings/trends') return envelope([{ period: '2026-08-31', totalEarned: 150000, totalCommission: 19500, netEarned: 130500, jobCount: 1 }]);
  if (pathname === '/api/v1/providers/me/service-area') return envelope({ currentArea: { id: 'area-1', name: 'Metro Cebu', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854 }, currentRadiusKm: 20, currentLatitude: 10.3157, currentLongitude: 123.8854, maxRadiusKm: 50, latestChange: null });
  if (pathname === '/api/v1/providers/staff') return envelope([staff]);
  if (pathname === '/api/v1/staff/my-jobs') return envelope([{ id: booking.id, status: booking.status, scheduledAt: booking.scheduledAt, address: booking.address, barangay: booking.barangay, city: booking.city, serviceName: booking.serviceName, customerName: booking.customerName, providerBusinessName: provider.businessName }]);
  if (pathname === '/api/v1/staff/my-invites') return envelope([{ staffId: staff.id, providerBusinessName: provider.businessName, roleTitle: staff.roleTitle, invitePhone: staff.invitePhone, inviteEmail: staff.inviteEmail }]);
  if (pathname === '/api/v1/bookings') return envelope([booking], { meta: { total: 1, page: 1, pageSize: 50 } });
  if (pathname === `/api/v1/bookings/${booking.id}`) return envelope(booking);
  if (pathname === `/api/v1/jobs/${booking.id}/checklist`) return envelope({ sections: [{ id: 'section-1', title: 'Service checks', items: [{ id: 'checklist-item-1', title: 'Inspect the unit', description: 'Record the initial condition.', isCompleted: true, completedAt: '2026-08-31T08:10:00.000Z', photoId: null, photoUrl: null, photoRequired: false }, { id: 'checklist-item-2', title: 'Test after cleaning', description: 'Confirm normal operation.', isCompleted: false, completedAt: null, photoId: null, photoUrl: null, photoRequired: false }] }] });
  if (pathname === `/api/v1/bookings/${booking.id}/proof-summary`) return envelope(proof);
  if (pathname === `/api/v1/uploads/booking-photo/${booking.id}`) return envelope([
    { id: 'photo-before-1', photoType: 'before', storageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E' },
    { id: 'photo-after-1', photoType: 'after', storageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E' },
  ]);
  if (pathname === '/api/v1/wallet') return envelope({ id: 'wallet-1', userId: providerUser.id, type: 'provider', availableBalance: 1245000, pendingBalance: 0, currency: 'PHP', createdAt: '2026-01-01T00:00:00.000Z' });
  if (pathname === '/api/v1/wallet/transactions') return envelope([{ id: 'tx-1', walletId: 'wallet-1', bookingId: booking.id, type: 'escrow_release', amount: 130500, balanceAfter: 1245000, description: 'Aircon Cleaning', referenceId: booking.id, createdAt: '2026-08-31T09:00:00.000Z' }], { pagination: { total: 1 } });
  if (pathname === '/api/v1/wallet/payout-preferences') return envelope({ preferredMethod: 'gcash', destinationAccount: '09171234567' });
  if (pathname === '/api/v1/wallet/payouts') return envelope([{ id: 'payout-1', providerId: provider.id, amount: 500000, method: 'gcash', destinationAccount: '0917••••567', status: 'completed', failureReason: null, rejectionReason: null, createdAt: '2026-08-28T00:00:00.000Z', completedAt: '2026-08-29T00:00:00.000Z' }], { pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
  if (pathname === '/api/v1/notifications') return envelope([], { meta: { total: 0, unread: 3, page: 1, pageSize: 1 } });
  if (pathname === '/api/v1/notifications/preferences') return envelope({ bookingUpdates: true, providerActivity: true, paymentAlerts: true, messages: true, sukiRewards: true, reminders: true, system: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00', quietHoursTimezone: 'Asia/Manila' });
  if (pathname === '/api/v1/providers/me/job-requests') return { success: true, requests: [{ id: 'lead-1', categoryName: 'Air Conditioning', description: 'Aircon is not cooling.', urgency: 'within_3_days', budgetMin: 120000, budgetMax: 200000, jobPhotos: [], jobVideoUrl: null, barangay: 'Lahug', city: 'Cebu City', distanceKm: 3.2, createdAt: '2026-08-31T04:00:00.000Z' }], total: 1 };
  if (pathname === '/api/v1/disputes/my') return envelope([dispute], { pagination: { page: 1, total: 1, totalPages: 1 } });
  if (pathname === `/api/v1/disputes/${dispute.id}`) return envelope(dispute);
  if (pathname === '/api/v1/suki/provider-customers') return envelope([{ id: 'suki-1', customerId: client.customerId, customerName: client.customerName, totalBookings: 4, totalSpent: 525000, tier: 'suki', discount: 5, lastBookingAt: booking.createdAt }], { pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
  if (pathname === '/api/v1/catalog') return envelope([{ id: 'category-1', slug: 'air-conditioning', name: 'Air Conditioning' }]);
  if (pathname === '/api/v1/conversations') return envelope([{ id: 'conversation-1', bookingId: booking.id, participants: [], lastMessage: null, unreadCount: 0, createdAt: '2026-08-30T00:00:00.000Z' }]);
  if (pathname === '/api/v1/conversations/conversation-1/messages') return envelope([
    { id: 'message-1', conversationId: 'conversation-1', senderId: providerUser.id, content: 'I will arrive at 4 PM.', messageType: 'text', imageUrl: null, isRead: true, createdAt: '2026-08-31T07:00:00.000Z' },
    { id: 'message-2', conversationId: 'conversation-1', senderId: 'customer-1', content: 'Thank you. The guard has your name.', messageType: 'text', imageUrl: null, isRead: true, createdAt: '2026-08-31T07:05:00.000Z' },
  ], { meta: { total: 2 } });
  if (pathname === '/api/v1/conversations/conversation-1/read') return envelope(null);
  if (pathname === '/api/v1/account/deletion/status') return envelope(null);
  if (pathname === '/api/v1/account/data-export') return envelope([]);
  if (pathname === '/api/v1/service-areas') return envelope([{ id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854, isActive: true }]);
  if (pathname === `/api/v1/reviews/provider/${provider.id}`) return envelope([{ id: 'review-1', bookingId: booking.id, reviewerId: 'customer-1', providerId: provider.id, rating: 5, qualityRating: 5, punctualityRating: 5, professionalismRating: 5, communicationRating: 5, valueRating: 5, comment: 'Careful work and clear updates.', providerResponse: null, providerResponseAt: null, isVisible: true, isFlagged: false, images: [], createdAt: '2026-08-29T00:00:00.000Z' }], { aggregate: provider.ratings, pagination: { total: 1, page: 1, pageSize: 15, totalPages: 1 } });
  if (pathname === '/api/v1/support-tickets/mine') return envelope([ticket]);
  if (pathname === `/api/v1/support-tickets/mine/${ticket.id}`) return envelope({ ...ticket, messages: [{ id: 'support-message-1', ticket_id: ticket.id, sender_id: 'support-agent-1', sender_role: 'admin', message: 'We are checking the payment release record now.', created_at: '2026-08-31T03:00:00.000Z', sender_first_name: 'Mia' }] });
  return null;
}

function safeName(route) {
  return route.replace(/^\//, '').replace(/[/?=&]+/g, '-').replace(/[^a-zA-Z0-9-]/g, '') || 'root';
}

async function seedSession(page, user) {
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'browser-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'browser-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, user);
}

async function auditRoute(browser, route, expectedText, width, user) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const unmatchedApi = new Set();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    // This fixture audit has no socket server. HTTP message history remains
    // fully exercised; expected local socket handshake failures are excluded.
    if (value.includes('/socket.io/') && value.includes('WebSocket connection')) return;
    consoleErrors.push(value);
  });
  await seedSession(page, user);
  await page.route('**/api/v1/**', async (intercepted) => {
    const url = new URL(intercepted.request().url());
    const body = responseFor(url);
    if (body == null) {
      unmatchedApi.add(`${intercepted.request().method()} ${url.pathname}`);
      await intercepted.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'AUDIT_FIXTURE_MISSING', message: `No fixture for ${url.pathname}` } }) });
      return;
    }
    await intercepted.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2_800);
  const state = await page.evaluate(() => ({
    path: `${location.pathname}${location.search}`,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const screenshotDir = path.join(evidenceRoot, String(width));
  await mkdir(screenshotDir, { recursive: true });
  const screenshotName = `${user.role === 'provider_staff' ? 'staff-' : ''}${safeName(route)}`;
  const screenshot = path.join(screenshotDir, `${screenshotName}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });

  const globalBoundary = state.text.includes('The app ran into an unexpected problem. You can try again.');
  const markerMissing = !state.text.toLocaleLowerCase().includes(expectedText.toLocaleLowerCase());
  const overflow = state.scrollWidth - state.clientWidth;
  const failed = pageErrors.length > 0 || consoleErrors.length > 0 || unmatchedApi.size > 0 || globalBoundary || markerMissing || overflow > 1;
  await context.close();
  return { route, persona: user.role, expectedText, width, actualPath: state.path, textPreview: state.text.slice(0, 300), markerMissing, globalBoundary, overflow, pageErrors, consoleErrors, unmatchedApi: [...unmatchedApi], screenshot, failed };
}

const browser = await chromium.launch();
const results = [];
try {
  const jobs = [768, 1024, 1366].flatMap((width) => [
    ...routes.map(([route, expectedText]) => ({ route, expectedText, width, user: providerUser })),
    ...staffRoutes.map(([route, expectedText]) => ({ route, expectedText, width, user: staffUser })),
  ]);
  const pending = [...jobs];
  const workers = Array.from({ length: 5 }, async () => {
    while (pending.length) {
      const job = pending.shift();
      if (!job) return;
      try {
        results.push(await auditRoute(browser, job.route, job.expectedText, job.width, job.user));
      } catch (error) {
        results.push({ ...job, failed: true, auditError: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  await Promise.all(workers);
} finally {
  await browser.close();
}

results.sort((a, b) => a.width - b.width || a.persona.localeCompare(b.persona) || a.route.localeCompare(b.route));
const reportPath = path.join(here, 'provider-populated-state-results.json');
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
const failures = results.filter((result) => result.failed);
process.stdout.write(`${JSON.stringify({ audited: results.length, failed: failures.length, reportPath, failures }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
