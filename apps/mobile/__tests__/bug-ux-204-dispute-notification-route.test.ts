import { resolveNotificationRoute } from '../src/utils/notification-navigation';

it('Bug UX-204 — dispute notifications open the participant case before generic booking routing', () => {
  const payload = { disputeId: 'dispute-1', bookingId: 'booking-1' };
  expect(resolveNotificationRoute('dispute_update', payload, 'customer')).toBe('/customer/dispute/dispute-1');
  expect(resolveNotificationRoute('dispute_update', payload, 'provider')).toBe('/provider/dispute/dispute-1');
});
