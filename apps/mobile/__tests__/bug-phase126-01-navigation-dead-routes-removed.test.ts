import { Routes, buildRoute } from '../src/config/navigation';

it('BUG-PHASE126-01 — the runtime route catalog exposes live booking workspaces and omits retired customer scaffolding', () => {
  expect(Routes.CUSTOMER.BOOKING_TRACKER).toBe('/customer/booking/tracker');
  expect(Routes.CUSTOMER.BOOKING_COMPLETE).toBe('/customer/booking/complete');
  expect(Routes.CUSTOMER.SETTINGS).toBe('/customer/notification-settings');
  expect(buildRoute(Routes.CUSTOMER.RECURRING_DETAIL, { id: 'repeat 1' })).toBe('/customer/recurring/repeat%201');
  expect(buildRoute(Routes.PROVIDER.JOB_DETAIL, { id: 'job 1' })).toBe('/provider/job/job%201');
  expect('SUBCATEGORY' in Routes.CUSTOMER).toBe(false);
  expect('PROVIDER_LIST' in Routes.CUSTOMER).toBe(false);
  expect('EARNINGS' in Routes.PROVIDER).toBe(false);
});
