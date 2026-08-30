import { resolveNotificationRoute } from '../src/utils/notification-navigation';

it('Bug UX-446 — customer suspension and reactivation notices open account management', () => {
  expect(resolveNotificationRoute('customer_suspended', {}, 'customer')).toBe('/customer/account-management');
  expect(resolveNotificationRoute('customer_reactivated', {}, 'customer')).toBe('/customer/account-management');
});
