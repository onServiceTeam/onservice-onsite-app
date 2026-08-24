jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { formatRecurringBooking } from '../src/services/recurring.service';

it('BUG-UX-191 — recurring responses hide stored payment tokens and report legacy auto-charge as disabled', () => {
  const formatted = formatRecurringBooking({
    id: 'series-1', customer_id: 'customer-1', provider_id: null,
    category_id: 'category-1', subcategory_id: 'subcategory-1', original_booking_id: null,
    frequency: 'weekly', preferred_day: 2, preferred_time: '09:00',
    address: '1 Service Road', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    latitude: null, longitude: null, service_price: 50000, service_fee: 5000,
    total_amount: 55000, status: 'active', next_booking_date: '2026-08-25',
    last_booking_date: null, skip_dates: [], auto_charge: true,
    payment_method_id: 'pm_must_not_leak', payment_method_label: 'Visa 4242',
    auto_charge_status: 'succeeded', allow_substitute: false, total_instances: 0,
    cancelled_at: null, cancellation_reason: null, created_at: new Date(), updated_at: new Date(),
  } as never);

  expect(formatted).toEqual(expect.objectContaining({
    autoCharge: false,
    autoChargeStatus: 'disabled',
    paymentMethodId: null,
  }));
  expect(JSON.stringify(formatted)).not.toContain('pm_must_not_leak');
});
