const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: jest.fn() }));

import { getAdminRecurringBooking } from '../src/services/recurring.service';

it('Bug UX-909 — Admin recurring detail exposes booking/support counts and truthful held payment/provider states without a payment token', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{
    id: 'series-909', customer_id: 'customer-909', provider_id: 'provider-909',
    category_id: 'category-909', subcategory_id: 'subcategory-909', original_booking_id: 'booking-source-909',
    frequency: 'weekly', preferred_day: 2, preferred_time: '09:00', address: '1 Test Street', barangay: 'Lahug',
    city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null, service_price: 50000, service_fee: 5000,
    total_amount: 55000, status: 'active', next_booking_date: '2026-09-08', last_booking_date: '2026-09-01',
    skip_dates: [], auto_charge: true, payment_method_id: 'pm_must_not_escape', payment_method_label: 'Visa ending 4242',
    auto_charge_status: 'failed', auto_charge_consecutive_failures: 1, auto_charge_suspended_at: null,
    auto_charge_last_attempt_at: null, allow_substitute: true, total_instances: 4, cancelled_at: null,
    cancellation_reason: null, created_at: new Date('2026-08-01'), updated_at: new Date('2026-09-01'),
    customer_name: 'Maria Santos', provider_name: 'Cebu Clean Co', category_name: 'Cleaning', subcategory_name: 'Home Cleaning',
    original_booking_status: 'confirmed', original_booking_total: 54000, failed_instances: 1, skipped_instances: 2,
    generated_instances: 4, open_support_tickets: 3,
  }] });

  const detail = await getAdminRecurringBooking('series-909');

  expect(detail).toMatchObject({
    customerName: 'Maria Santos', providerName: 'Cebu Clean Co', originalBookingId: 'booking-source-909',
    operationalPaymentMode: 'manual_per_booking', providerAssignmentState: 'legacy_provider_link',
    legacyAutoChargePreference: true, failedInstances: 1, skippedInstances: 2, generatedInstances: 4,
    openSupportTickets: 3, paymentMethodId: null,
  });
  expect(JSON.stringify(detail)).not.toContain('pm_must_not_escape');
});
