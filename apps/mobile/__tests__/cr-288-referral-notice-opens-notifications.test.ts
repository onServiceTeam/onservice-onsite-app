// Customer review 2026-10-18, referral off switch (D41 Q32 option a): the
// referral page is hidden, so a referral or promo notice (inbox tap, in-app
// notice or phone push) opens the Notifications inbox instead.
import { resolveNotificationRoute } from '../src/utils/notification-navigation';

it('Bug CR-288 — a referral or promo notification opens Notifications, not the referral page', () => {
  expect(resolveNotificationRoute('referral', {}, 'customer')).toBe('/customer/notifications');
  expect(resolveNotificationRoute('promo', { code: 'CEBU25' }, 'customer')).toBe('/customer/notifications');
  expect(resolveNotificationRoute('referral', null, 'customer')).not.toBe('/customer/referral');
});
