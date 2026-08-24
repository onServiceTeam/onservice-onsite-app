import api from '@/services/api';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/services/notification.service';

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

it('Bug UX-236 — preference saves exclude strict read-only marketing-consent evidence', async () => {
  jest.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: {
        bookingUpdates: true,
        providerActivity: true,
        paymentAlerts: true,
        messages: true,
        promotions: true,
        sukiRewards: true,
        reminders: true,
        system: true,
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        quietHoursTimezone: 'Asia/Manila',
        marketingPushEnabled: true,
        marketingSmsEnabled: false,
        marketingEmailEnabled: true,
        marketingConsentAcknowledgedAt: '2026-08-01T00:00:00.000Z',
        marketingConsentVersion: 3,
      },
    },
  } as never);

  const editable = await getNotificationPreferences();
  expect(editable).not.toHaveProperty('marketingConsentAcknowledgedAt');
  expect(editable).not.toHaveProperty('marketingConsentVersion');
  expect(editable).not.toHaveProperty('promotions');

  jest.mocked(api.put).mockResolvedValue({ data: { success: true, data: editable } } as never);
  await updateNotificationPreferences(editable);

  expect(api.put).toHaveBeenCalledWith('/api/v1/notifications/preferences', editable);
});
