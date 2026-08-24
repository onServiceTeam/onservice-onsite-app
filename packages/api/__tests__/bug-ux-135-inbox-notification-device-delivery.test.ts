const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createPushNotification } from '../src/services/notification.service';

const enabledPrefs = {
  user_id: 'user-1', booking_updates: true, provider_activity: true, payment_alerts: true,
  messages: true, promotions: false, suki_rewards: true, reminders: true, system: true,
  marketing_push_enabled: false, marketing_sms_enabled: false, marketing_email_enabled: false,
  marketing_consent_acknowledged_at: null, marketing_consent_version: null,
  quiet_hours_enabled: false, quiet_hours_start: '22:00:00', quiet_hours_end: '07:00:00',
  quiet_hours_timezone: 'Asia/Manila',
};

async function waitForFetch(fetchMock: jest.Mock): Promise<void> {
  for (let i = 0; i < 10 && fetchMock.mock.calls.length === 0; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

it('Bug UX-135 — a user-facing inbox notification with an enabled preference also wakes the registered device', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }) });
  globalThis.fetch = fetchMock as typeof fetch;
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [{ id: 'notification-1', user_id: 'user-1', type: 'new_message', title: 'New message', body: 'Hello', data: {}, is_read: false, created_at: new Date() }], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM notification_preferences')) return { rows: [enabledPrefs], rowCount: 1 };
    if (sql.includes('quiet_hours_enabled')) return { rows: [enabledPrefs], rowCount: 1 };
    if (sql.includes('FROM push_tokens')) return { rows: [{ token: 'ExponentPushToken[test]', platform: 'android' }], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  await createPushNotification({
    userId: 'user-1', type: 'new_message', title: 'New message', body: 'Hello',
    data: { bookingId: 'booking-1' },
  });
  await waitForFetch(fetchMock);

  expect(fetchMock).toHaveBeenCalledWith(
    'https://exp.host/--/api/v2/push/send',
    expect.objectContaining({ method: 'POST' }),
  );
  const request = fetchMock.mock.calls[0]![1] as { body: string };
  expect(JSON.parse(request.body)[0]).toMatchObject({
    to: 'ExponentPushToken[test]',
    data: { bookingId: 'booking-1', notificationId: 'notification-1', type: 'new_message' },
  });
});
