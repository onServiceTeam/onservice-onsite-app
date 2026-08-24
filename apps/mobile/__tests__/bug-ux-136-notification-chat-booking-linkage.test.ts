import { resolveNotificationRoute } from '../src/utils/notification-navigation';

it('Bug UX-136 — chat notifications use the booking identifier expected by both chat screens instead of the conversation identifier', () => {
  const data = { bookingId: 'booking with spaces', conversationId: 'conversation-1' };
  expect(resolveNotificationRoute('new_message', data, 'customer')).toBe('/customer/chat/booking%20with%20spaces');
  expect(resolveNotificationRoute('new_message', data, 'provider')).toBe('/provider/chat/booking%20with%20spaces');
  expect(resolveNotificationRoute('new_message', { conversationId: 'conversation-1' }, 'provider')).toBeNull();
});
