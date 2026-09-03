import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_CHROMIUM_ARGS,
  AUDIT_CONTEXT_OPTIONS,
  AUDIT_SCREENSHOT_OPTIONS,
  installFixedBrowserTime,
  settleBrowserEvidence,
} from '../browser-audit-clock.mjs';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:7390';
const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.join(here, 'populated-state-screenshots');

const customerUser = {
  id: 'customer-browser-audit', phone: '+639171112222', email: 'customer.audit@invalid.example',
  firstName: 'Paolo', lastName: 'Garcia', role: 'customer', avatarUrl: null,
};

const category = {
  id: 'category-1', name: 'Air Conditioning', slug: 'air-conditioning',
  description: 'Cooling-system installation, cleaning, and repair.', iconUrl: null, displayOrder: 1,
};

const subcategory = {
  id: 'subcategory-1', categoryId: category.id, categoryName: category.name, categorySlug: category.slug,
  name: 'Aircon Cleaning', slug: 'aircon-cleaning',
  description: 'Cleaning of one wall-mounted split-type air-conditioning unit, including before and after evidence.',
  pricingType: 'fixed', basePrice: 150000, minPrice: 150000, maxPrice: 150000,
  estimatedDurationMinutes: 120, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
};

const providerService = {
  id: 'provider-service-1', providerId: 'audit-provider', subcategoryId: subcategory.id,
  subcategoryName: subcategory.name, categoryId: category.id, categoryName: category.name,
  categorySlug: category.slug, description: subcategory.description, pricingType: 'fixed',
  hourlyRate: null, unitLabel: null, unitPrice: null, basePrice: 150000, isActive: true,
};

const provider = {
  id: 'audit-provider', userId: 'provider-browser-audit', name: 'Santos Home Services',
  businessName: 'Santos Home Services', tier: 'verified', bio: 'Licensed technician focused on documented, careful work.',
  rating: 4.8, averageRating: 4.8, totalJobs: 47, totalReviews: 22, acceptanceRate: 0.93,
  responseTimeMinutes: 12, yearsExperience: 8, serviceRadiusKm: 20, isAvailable: true,
  latitude: 10.3157, longitude: 123.8854, city: 'Cebu City', province: 'Cebu',
  createdAt: '2025-01-10T00:00:00.000Z', services: [providerService],
  schedule: [{ id: 'schedule-1', dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true }],
  ratings: { overall: 4.8, totalReviews: 22, quality: 4.9, punctuality: 4.7, professionalism: 4.8, communication: 4.8, value: 4.7 },
  portfolio: [], certifications: [], sukiCount: 14,
};

const baseBooking = {
  id: 'audit-booking', customerId: customerUser.id, providerId: provider.id,
  categoryId: category.id, subcategoryId: subcategory.id, bookingType: 'fixed_price', status: 'in_progress',
  escrowStatus: 'held', servicePrice: 150000, serviceFee: 7500, totalAmount: 157500,
  description: 'Clean one split-type unit and document the finished work.', address: '88 Banilad Road',
  barangay: 'Banilad', city: 'Mandaue City', province: 'Cebu', latitude: 10.335, longitude: 123.91,
  scheduledAt: '2026-08-31T08:00:00.000Z', completedAt: null, confirmedAt: null,
  cancelledAt: null, cancellationReason: null, paymentMethod: 'wallet', surgeMultiplier: 1,
  surgeAmount: 0, rebookedFromId: null, sukiDiscount: 0, jobPhotos: [], providerBeforePhotos: [],
  providerAfterPhotos: [], createdAt: '2026-08-28T03:00:00.000Z', providerName: provider.name,
  serviceName: subcategory.name, categoryName: category.name, customerName: 'Paolo Garcia',
  performerStaffId: null, intakeAnswers: { unit_count: 1 }, urgency: null, budgetMin: null,
  budgetMax: null, jobVideoUrl: null, workStartedAt: '2026-08-31T08:05:00.000Z',
};

const address = {
  id: 'address-1', label: 'Home', fullAddress: baseBooking.address, barangay: baseBooking.barangay,
  city: baseBooking.city, province: baseBooking.province, region: 'Region VII', zipCode: '6014',
  latitude: baseBooking.latitude, longitude: baseBooking.longitude, isDefault: true,
  notes: 'Guardhouse can provide access.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

const review = {
  id: 'review-1', bookingId: baseBooking.id, reviewerId: customerUser.id, providerId: provider.id,
  rating: 5, qualityRating: 5, punctualityRating: 5, professionalismRating: 5,
  communicationRating: 5, valueRating: 5, comment: 'Careful work and clear updates.',
  providerResponse: 'Thank you for trusting us.', providerResponseAt: '2026-08-30T00:00:00.000Z',
  isVisible: true, isFlagged: false, images: [], createdAt: '2026-08-29T00:00:00.000Z',
};

const dispute = {
  id: 'audit-dispute', bookingId: baseBooking.id, filedBy: customerUser.id, type: 'substandard',
  description: 'Please review the documented work quality.', status: 'under_review', tier: 1,
  assignedTo: null, resolutionType: null, refundAmount: 0, refundPercent: null, decisionNotes: null,
  providerResponse: 'I have attached the completion evidence.', providerRespondedAt: '2026-08-31T10:15:00.000Z',
  autoResolved: false, resolvedAt: null, resolvedBy: null, createdAt: '2026-08-31T10:00:00.000Z',
  updatedAt: '2026-08-31T10:15:00.000Z', customerName: 'Paolo Garcia', providerName: provider.name,
  evidence: [],
};

const project = {
  id: 'audit-project', customerId: customerUser.id, providerId: provider.id, categoryId: category.id,
  title: 'Kitchen renovation planning', description: 'Plan stages, selections, and reference documents.',
  address: baseBooking.address, city: baseBooking.city, status: 'active', estimatedTotal: 3500000,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
  customerName: 'Paolo Garcia', providerName: provider.name,
};

const recurring = {
  id: 'audit-recurring', customerId: customerUser.id, providerId: provider.id, categoryId: category.id,
  subcategoryId: subcategory.id, categoryName: category.name, subcategoryName: subcategory.name,
  frequency: 'monthly', preferredDay: 1, preferredTime: '09:00',
  address: baseBooking.address, barangay: baseBooking.barangay, city: baseBooking.city,
  province: baseBooking.province, latitude: baseBooking.latitude, longitude: baseBooking.longitude,
  status: 'active', servicePrice: 150000, serviceFee: 7500, totalAmount: 157500,
  nextScheduledDate: '2026-09-28', createdAt: '2026-06-01T00:00:00.000Z',
  providerName: provider.name, totalCompleted: 3, totalSkipped: 0, cancelReason: null,
};

const ticket = {
  id: 'audit-ticket', ticket_number: 'SUP-2026-0812', type: 'payment_issue', status: 'in_progress',
  priority: 'medium', subject: 'Payment status question',
  description: 'Please confirm the current payment and escrow status for my booking.',
  booking_id: baseBooking.id, created_at: '2026-08-30T02:00:00.000Z', updated_at: '2026-08-31T02:00:00.000Z',
  message_count: '1', agent_first_name: 'Mia',
};

const routes = [
  ['/home', 'Welcome back, Paolo'], ['/bookings', 'Bookings'], ['/wallet', 'Wallet'], ['/profile', 'Profile'],
  ['/customer/account-management', 'Account & Data'], ['/customer/address-picker', 'Select Address'],
  ['/customer/addresses', 'My Addresses'], ['/customer/booking/audit-booking', 'Booking Details'],
  ['/customer/booking/change-order?bookingId=audit-booking', 'Change Order'],
  ['/customer/booking/checkout', 'Checkout'], ['/customer/booking/complete?bookingId=audit-booking', 'Job Complete'],
  ['/customer/booking/configure', 'Customize Your Service'],
  ['/customer/booking/confirm?bookingId=audit-booking', 'Booking'],
  ['/customer/booking/dispute?bookingId=audit-booking', 'File a Dispute'],
  ['/customer/booking/form', 'Book Service'],
  ['/customer/booking/job-request', 'Request Custom Quote'],
  ['/customer/booking/make-recurring?bookingId=audit-booking', 'Make This Recurring'],
  ['/customer/booking/pay?bookingId=audit-booking', 'Complete Payment'],
  ['/customer/booking/payment-failed?bookingId=audit-booking&reason=Payment%20was%20not%20completed', 'Payment'],
  ['/customer/booking/photos?bookingId=audit-booking', 'Job Evidence'],
  ['/customer/booking/quotes?bookingId=audit-booking', 'Quotes'],
  ['/customer/booking/review?bookingId=audit-booking', 'Rate & Review'],
  ['/customer/booking/tip?bookingId=audit-booking', 'Tip Your Provider'],
  ['/customer/booking/tracker?bookingId=audit-booking', 'Track Booking'],
  ['/customer/category/air-conditioning', 'Air Conditioning'],
  ['/customer/chat/audit-booking', 'Santos Home Services'], ['/customer/data-rights', 'Your Data Rights'],
  ['/customer/dispute/audit-dispute', 'Dispute'], ['/customer/disputes', 'Disputes'],
  ['/customer/help', 'Help'], ['/customer/notification-settings', 'Notification preferences'],
  ['/customer/notifications', 'Notifications'], ['/customer/payment-methods', 'Payment Methods'],
  ['/customer/projects/audit-project', 'Kitchen renovation planning'], ['/customer/projects', 'Projects'],
  ['/customer/projects/new', 'New Project'], ['/customer/provider/audit-provider', 'Santos Home Services'],
  ['/customer/recurring/audit-recurring', 'Recurring Booking'], ['/customer/recurring', 'Recurring Bookings'],
  ['/customer/referral', 'Referral Program'], ['/customer/safety-and-support', 'Safety'],
  ['/customer/search?q=aircon', 'Services (1)'], ['/customer/suki-pros', 'Suki'],
  ['/customer/terms', 'Terms'], ['/customer/wallet-topup', 'Top Up Wallet'],
  ['/support', 'Your requests'], ['/support/new', 'New request'], ['/support/audit-ticket', 'Payment status question'],
];

function envelope(data, extra = {}) {
  return { success: true, data, ...extra };
}

function bookingForRoute(route) {
  if (route.includes('/booking/complete')) {
    return { ...baseBooking, status: 'completed_by_provider', completedAt: '2026-08-31T10:00:00.000Z' };
  }
  if (/booking\/(review|tip|make-recurring)/.test(route)) {
    return { ...baseBooking, status: 'confirmed', completedAt: '2026-08-31T10:00:00.000Z', confirmedAt: '2026-08-31T10:15:00.000Z' };
  }
  if (/booking\/(pay|confirm|payment-failed)/.test(route)) {
    return { ...baseBooking, status: 'payment_pending', escrowStatus: 'pending' };
  }
  if (/booking\/quotes/.test(route)) return { ...baseBooking, status: 'awaiting_quotes', providerId: null, providerName: null, escrowStatus: 'pending' };
  return baseBooking;
}

function responseFor(url, route) {
  const { pathname, searchParams } = url;
  const booking = bookingForRoute(route);
  if (pathname === '/api/v1/config') return envelope({ maxQuotesPerBooking: 5 });
  if (pathname === '/api/v1/auth/me') return envelope(customerUser);
  if (pathname === '/api/v1/catalog') return envelope([category]);
  if (pathname === `/api/v1/catalog/${category.slug}`) return envelope({ ...category, subcategories: [subcategory] });
  if (pathname === '/api/v1/catalog/search') return envelope({ services: [subcategory], providers: [{ id: provider.id, userId: provider.userId, businessName: provider.name, tier: provider.tier, averageRating: provider.rating, totalReviews: 22, city: provider.city, avatarUrl: null }] });
  if (pathname === `/api/v1/catalog/subcategory/${subcategory.id}/addons`) return envelope([{ id: 'addon-1', subcategoryId: subcategory.id, name: 'Outdoor unit cleaning', description: 'Clean accessible outdoor condenser surfaces.', price: 50000, displayOrder: 1 }]);
  if (pathname === `/api/v1/catalog/subcategories/${subcategory.id}/intake-fields`) return envelope([{ id: 'field-1', subcategoryId: subcategory.id, fieldKey: 'unit_count', label: 'How many units?', helpText: 'Count indoor units.', fieldType: 'number', unit: 'units', options: null, placeholder: '1', isRequired: true, sortOrder: 1, isActive: true }]);
  if (pathname === '/api/v1/promotions/active') return envelope([{ id: 'promo-1', title: 'Cebu launch offer', subtitle: 'Save on your first documented service.', imageUrl: null, badge: 'NEW', ctaText: 'Browse services', ctaLink: '/home', targetAudience: 'customer', startDate: '2026-08-01', endDate: null }]);
  if (pathname === '/api/v1/addresses') return envelope([address]);
  if (pathname === '/api/v1/service-areas') return envelope([{ id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854, isActive: true }]);
  if (pathname === '/api/v1/service-areas/check') return envelope({ covered: true, serviceArea: { id: 'area-1', name: 'Metro Cebu', city: 'Cebu City', province: 'Cebu' } });
  if (pathname === '/api/v1/bookings') {
    const status = searchParams.get('status');
    const rows = status === 'completed' ? [{ ...baseBooking, status: 'completed', completedAt: '2026-08-30T10:00:00.000Z' }] : [baseBooking];
    return envelope(rows, { meta: { total: rows.length, page: 1, pageSize: 20, totalPages: 1 } });
  }
  if (pathname === `/api/v1/bookings/${baseBooking.id}`) return envelope(booking);
  if (pathname === `/api/v1/bookings/${baseBooking.id}/quotes`) return envelope([{ id: 'quote-1', bookingId: baseBooking.id, providerId: provider.id, quotedPrice: 165000, description: 'Complete deep clean with documented testing.', estimatedDurationMinutes: 120, status: 'pending', laborAmount: 145000, materialsAmount: 20000, estimatedDays: 1, notes: 'Includes accessible indoor and outdoor surfaces.', portfolioPhotos: [], expiresAt: '2026-09-02T00:00:00.000Z', createdAt: '2026-08-31T00:00:00.000Z', providerName: provider.name, providerRating: provider.rating, providerTotalJobs: provider.totalJobs, lineItems: [{ id: 'line-1', description: 'Deep cleaning', quantity: 1, unit: 'service', unitPrice: 165000, lineTotal: 165000, itemType: 'labor' }] }]);
  if (pathname === `/api/v1/bookings/${baseBooking.id}/change-orders`) return envelope([{ id: 'change-1', bookingId: baseBooking.id, providerId: provider.id, description: 'Replace a worn drain hose found during cleaning.', additionalAmount: 45000, additionalServiceFee: 2250, additionalTotal: 47250, lineItems: [{ id: 'change-line-1', description: 'Drain hose replacement', quantity: 1, unit: 'piece', unitPrice: 45000, lineTotal: 45000, itemType: 'materials' }], photos: [], status: 'pending', customerRespondedAt: null, createdAt: '2026-08-31T09:00:00.000Z' }]);
  if (pathname === `/api/v1/bookings/${baseBooking.id}/proof-summary`) return envelope({ booking: { id: baseBooking.id, status: booking.status, description: booking.description, workStartedAt: baseBooking.workStartedAt, workCompletedAt: booking.completedAt, completedAt: booking.completedAt, confirmedAt: booking.confirmedAt, completionNotes: 'Unit cleaned and tested.' }, readiness: { stage: booking.status, readyForProviderCompletion: true, minimumTimeOnSiteMinutes: 30, afterPhotosRequired: 2, blockers: [], qualityFlags: [] }, checklist: { templateVersion: 1, shownAt: baseBooking.workStartedAt, totalItems: 2, requiredItems: 2, completedRequiredItems: 2, complete: true, items: [] }, photos: [{ id: 'photo-before-1', photoType: 'before', uploadedByRole: 'provider', source: 'canonical', uploadedAt: '2026-08-31T08:06:00.000Z' }, { id: 'photo-after-1', photoType: 'after', uploadedByRole: 'provider', source: 'canonical', uploadedAt: '2026-08-31T09:55:00.000Z' }], signatures: { identityCaveat: 'Provider-session capture is not verified customer identity.', records: [] }, changeOrders: [], communications: { chatMessageCount: 2, supportTickets: [] }, dispute: null });
  if (pathname === `/api/v1/uploads/booking-photo/${baseBooking.id}`) return envelope([{ id: 'photo-before-1', bookingId: baseBooking.id, photoType: 'before', storageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E', uploadedBy: provider.userId, uploadedByRole: 'provider', uploadedAt: '2026-08-31T08:06:00.000Z' }, { id: 'photo-after-1', bookingId: baseBooking.id, photoType: 'after', storageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E', uploadedBy: provider.userId, uploadedByRole: 'provider', uploadedAt: '2026-08-31T09:55:00.000Z' }]);
  if (pathname === '/api/v1/wallet') return envelope({ id: 'wallet-1', userId: customerUser.id, type: 'customer', availableBalance: 500000, pendingBalance: 157500, currency: 'PHP', createdAt: '2026-01-01T00:00:00.000Z' });
  if (pathname === '/api/v1/wallet/transactions') return envelope([{ id: 'tx-1', walletId: 'wallet-1', bookingId: baseBooking.id, type: 'escrow_hold', amount: -157500, balanceAfter: 500000, description: subcategory.name, referenceId: baseBooking.id, createdAt: '2026-08-31T07:00:00.000Z' }], { pagination: { total: 1 } });
  if (pathname === '/api/v1/notifications') return envelope([{ id: 'notification-1', type: 'booking_status', title: 'Provider is on the way', body: 'Santos Home Services is heading to your service address.', data: { bookingId: baseBooking.id }, isRead: false, createdAt: '2026-08-31T07:30:00.000Z' }], { meta: { total: 1, unread: 1, page: 1, pageSize: 20, totalPages: 1 } });
  if (pathname === '/api/v1/notifications/preferences') return envelope({ bookingUpdates: true, providerActivity: true, paymentAlerts: true, messages: true, sukiRewards: true, reminders: true, system: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00', quietHoursTimezone: 'Asia/Manila' });
  if (pathname === `/api/v1/providers/${provider.id}`) return envelope(provider);
  if (pathname === `/api/v1/reviews/provider/${provider.id}`) return envelope([review], { aggregate: provider.ratings, pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
  if (pathname === `/api/v1/reviews/booking/${baseBooking.id}`) return envelope(null);
  if (pathname === '/api/v1/suki/memberships') return envelope([{ id: 'membership-1', customerId: customerUser.id, providerId: provider.id, providerName: provider.name, tier: 'suki', totalBookings: 4, totalSpent: 625000, pointsBalance: 1200, pointsMultiplier: 1.25, discount: 5, createdAt: '2026-04-01T00:00:00.000Z', lastBookingAt: baseBooking.createdAt }], { pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
  if (pathname === '/api/v1/suki/tiers') return envelope([{ name: 'Suki', minBookings: 3, pointsMultiplier: 1.25, discount: 5 }]);
  if (pathname === '/api/v1/suki/memberships/membership-1/rewards') return envelope([{ id: 'reward-1', membershipId: 'membership-1', type: 'booking', points: 250, description: 'Completed service reward', bookingId: baseBooking.id, createdAt: '2026-08-30T00:00:00.000Z' }], { pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
  if (pathname === '/api/v1/disputes/my') return envelope([dispute], { pagination: { page: 1, total: 1, totalPages: 1 } });
  if (pathname === `/api/v1/disputes/${dispute.id}`) return envelope(dispute);
  if (pathname === '/api/v1/conversations') return envelope([{ id: 'conversation-1', bookingId: baseBooking.id, participants: [], lastMessage: null, unreadCount: 0, createdAt: '2026-08-30T00:00:00.000Z' }]);
  if (pathname === '/api/v1/conversations/conversation-1/messages') return envelope([{ id: 'message-1', conversationId: 'conversation-1', senderId: provider.userId, content: 'I will arrive at 8 AM.', messageType: 'text', imageUrl: null, isRead: true, createdAt: '2026-08-31T07:00:00.000Z' }, { id: 'message-2', conversationId: 'conversation-1', senderId: customerUser.id, content: 'Thank you. The guard has your name.', messageType: 'text', imageUrl: null, isRead: true, createdAt: '2026-08-31T07:05:00.000Z' }], { meta: { total: 2 } });
  if (pathname === '/api/v1/conversations/conversation-1/read') return envelope(null);
  if (pathname === '/api/v1/projects') return envelope([project]);
  if (pathname === `/api/v1/projects/${project.id}`) return envelope({ ...project, milestones: [{ id: 'milestone-1', projectId: project.id, title: 'Finalize scope', description: 'Confirm materials and measurements.', sortOrder: 1, status: 'in_progress', amount: 500000, targetDate: '2026-09-15', completedAt: null, createdAt: '2026-07-01T00:00:00.000Z' }], selections: [{ id: 'selection-1', projectId: project.id, category: 'Finish', label: 'Cabinet colour', value: 'Warm white', detail: null, sortOrder: 1 }], documents: [] });
  if (pathname === '/api/v1/recurring') return envelope([recurring], { pagination: { total: 1 } });
  if (pathname === `/api/v1/recurring/${recurring.id}`) return envelope(recurring);
  if (pathname === `/api/v1/recurring/preview/${subcategory.id}`) return envelope({ servicePrice: 150000, serviceFee: 7500, totalAmount: 157500 });
  if (pathname === '/api/v1/referrals/my-code') return envelope({ id: 'referral-code-1', code: 'PAOLO2026', type: 'customer', usesCount: 2, maxUses: null, referrerBonus: 10000, refereeBonus: 10000, isActive: true, expiresAt: null, createdAt: '2026-01-01T00:00:00.000Z' });
  if (pathname === '/api/v1/referrals/my-referrals') return envelope({ code: null, redemptions: [], summary: { totalReferrals: 2, creditedReferrals: 1, pendingReferrals: 1, totalEarned: 10000 } });
  if (pathname === '/api/v1/account/deletion/status') return envelope(null);
  if (pathname === '/api/v1/account/data-export') return envelope([{ id: 'export-1', status: 'completed', format: 'json', fileUrl: null, expiresAt: '2026-09-01T00:00:00.000Z', requestedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T01:00:00.000Z' }]);
  if (pathname === '/api/v1/compliance/my-requests') return envelope([{ id: 'dsr-1', userId: customerUser.id, userEmail: customerUser.email, requestType: 'access', status: 'in_progress', receivedAt: '2026-08-20T00:00:00.000Z', dueAt: '2026-09-19T00:00:00.000Z', completedAt: null, handledBy: null, userMessage: 'Please provide my account data.', adminNotes: null, responsePayloadUrl: null, rejectionReason: null, daysUntilDue: 19, isOverdue: false }]);
  if (pathname === '/api/v1/compliance/my-pending-consents') return envelope([]);
  if (pathname === '/api/v1/tips/limits') return envelope({ minCents: 100, maxCents: 500000 });
  if (pathname === '/api/v1/settings/cancellation-policy') return envelope({ version: 1, effective_from: '2026-08-01', intro_text: 'Cancellation refunds depend on how early the booking is cancelled.', legal_disclaimer: 'Final outcomes depend on the booking record and applicable law.', provider_no_show_credit_php: 100, tiers: [{ min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: '24 hours or more' }, { min_hours_before: 0, max_hours_before: 24, refund_percent: 50, fee_percent: 50, label: 'Less than 24 hours' }] });
  if (pathname === '/api/v1/support-tickets/mine') return envelope([ticket]);
  if (pathname === `/api/v1/support-tickets/mine/${ticket.id}`) return envelope({ ...ticket, messages: [{ id: 'support-message-1', ticket_id: ticket.id, sender_id: 'support-agent-1', sender_role: 'admin', message: 'We are checking the payment record now.', created_at: '2026-08-31T03:00:00.000Z', sender_first_name: 'Mia' }] });
  return null;
}

function safeName(route) {
  return route.replace(/^\//, '').replace(/[/?=&]+/g, '-').replace(/[^a-zA-Z0-9-]/g, '') || 'root';
}

async function seedSession(page) {
  await page.addInitScript((user) => {
    localStorage.setItem('onservice-auth-secure:accessToken', 'browser-audit-access-token');
    localStorage.setItem('onservice-auth-secure:refreshToken', 'browser-audit-refresh-token');
    localStorage.setItem('onservice-auth-secure:user', JSON.stringify(user));
  }, customerUser);
}

async function auditRoute(browser, route, expectedText, width) {
  const context = await browser.newContext({
    ...AUDIT_CONTEXT_OPTIONS,
    viewport: { width, height: 900 },
  });
  const page = await context.newPage();
  await installFixedBrowserTime(page);
  const pageErrors = [];
  const consoleErrors = [];
  const unmatchedApi = new Set();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (value.includes('/socket.io/') && value.includes('WebSocket connection')) return;
    consoleErrors.push(value);
  });
  await seedSession(page);
  await page.route('**/api/v1/**', async (intercepted) => {
    const url = new URL(intercepted.request().url());
    const body = responseFor(url, route);
    if (body == null) {
      unmatchedApi.add(`${intercepted.request().method()} ${url.pathname}`);
      await intercepted.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'AUDIT_FIXTURE_MISSING', message: `No fixture for ${url.pathname}` } }) });
      return;
    }
    await intercepted.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByText(expectedText, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  await settleBrowserEvidence(page);
  const state = await page.evaluate(() => ({
    path: `${location.pathname}${location.search}`,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const screenshotDir = path.join(evidenceRoot, String(width));
  await mkdir(screenshotDir, { recursive: true });
  const screenshot = path.join(screenshotDir, `${safeName(route)}.png`);
  await page.screenshot({ path: screenshot, fullPage: false, ...AUDIT_SCREENSHOT_OPTIONS });

  const globalBoundary = state.text.includes('The app ran into an unexpected problem. You can try again.');
  const markerMissing = !state.text.toLocaleLowerCase().includes(expectedText.toLocaleLowerCase());
  const overflow = state.scrollWidth - state.clientWidth;
  const failed = pageErrors.length > 0 || consoleErrors.length > 0 || unmatchedApi.size > 0 || globalBoundary || markerMissing || overflow > 1;
  await context.close();
  return { route, expectedText, width, actualPath: state.path, textPreview: state.text.slice(0, 400), markerMissing, globalBoundary, overflow, pageErrors, consoleErrors, unmatchedApi: [...unmatchedApi], screenshot, failed };
}

const browser = await chromium.launch({ args: AUDIT_CHROMIUM_ARGS });
const results = [];
try {
  const jobs = [768, 1024, 1366].flatMap((width) => routes.map(([route, expectedText]) => ({ route, expectedText, width })));
  const pending = [...jobs];
  const workers = Array.from({ length: 5 }, async () => {
    while (pending.length) {
      const job = pending.shift();
      if (!job) return;
      try {
        results.push(await auditRoute(browser, job.route, job.expectedText, job.width));
      } catch (error) {
        results.push({ ...job, failed: true, auditError: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  await Promise.all(workers);
} finally {
  await browser.close();
}

results.sort((a, b) => a.width - b.width || a.route.localeCompare(b.route));
const reportPath = path.join(here, 'customer-populated-state-results.json');
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
const failures = results.filter((result) => result.failed);
process.stdout.write(`${JSON.stringify({ audited: results.length, failed: failures.length, reportPath, failures }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
