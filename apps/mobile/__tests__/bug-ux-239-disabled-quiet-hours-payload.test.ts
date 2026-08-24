import api from '@/services/api';
import { updateNotificationPreferences } from '@/services/notification.service';

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { put: jest.fn() },
}));

it('Bug UX-239 — disabling quiet hours omits hidden invalid time values from the save request', async () => {
  const preferences = {
    bookingUpdates: true,
    providerActivity: true,
    paymentAlerts: true,
    messages: true,
    sukiRewards: true,
    reminders: true,
    system: true,
    quietHoursEnabled: false,
    quietHoursStart: '99:99',
    quietHoursEnd: 'invalid',
    quietHoursTimezone: 'Asia/Manila',
  };
  jest.mocked(api.put).mockResolvedValue({
    data: {
      success: true,
      data: {
        ...preferences,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      },
    },
  } as never);

  await updateNotificationPreferences(preferences);

  expect(api.put).toHaveBeenCalledWith('/api/v1/notifications/preferences', {
    bookingUpdates: true,
    providerActivity: true,
    paymentAlerts: true,
    messages: true,
    sukiRewards: true,
    reminders: true,
    system: true,
    quietHoursEnabled: false,
  });
});
