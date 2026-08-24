const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createPushNotification } from '../src/services/notification.service';

const disabledMessagePrefs = {
  user_id: 'user-1', booking_updates: true, provider_activity: true, payment_alerts: true,
  messages: false, promotions: false, suki_rewards: true, reminders: true, system: true,
  marketing_push_enabled: false, marketing_sms_enabled: false, marketing_email_enabled: false,
  marketing_consent_acknowledged_at: null, marketing_consent_version: null,
  quiet_hours_enabled: false, quiet_hours_start: '22:00:00', quiet_hours_end: '07:00:00',
  quiet_hours_timezone: 'Asia/Manila',
};

it('Bug UX-134 — disabling message notifications suppresses the device push while preserving the in-app inbox row', async () => {
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock as typeof fetch;
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [{ id: 'notification-1', user_id: 'user-1', type: 'new_message', title: 'New message', body: 'Hello', data: {}, is_read: false, created_at: new Date() }], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM notification_preferences')) {
      return { rows: [disabledMessagePrefs], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  const row = await createPushNotification({
    userId: 'user-1', type: 'new_message', title: 'New message', body: 'Hello',
    data: { bookingId: 'booking-1' },
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(row.id).toBe('notification-1');
  expect(dbQueryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO notifications'))).toBe(true);
  expect(dbQueryMock.mock.calls.some(([sql]) => String(sql).includes('FROM push_tokens'))).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
