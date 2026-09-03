import { resolveNotificationRoute } from '@/utils/notification-navigation';

it('Bug OPS-306 — customer and provider support-update notifications open the exact shared support case', () => {
  for (const role of ['customer', 'provider'] as const) {
    expect(resolveNotificationRoute('support_update', { ticketId: 'ticket-306' }, role)).toBe('/support/ticket-306');
  }
});
