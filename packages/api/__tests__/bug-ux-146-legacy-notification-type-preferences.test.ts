const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createPushNotification,
  type NotificationType,
} from '../src/services/notification.service';

const disabledPrefs = {
  user_id: 'user-1',
  booking_updates: true,
  provider_activity: true,
  payment_alerts: false,
  messages: true,
  promotions: true,
  suki_rewards: false,
  reminders: true,
  system: true,
  marketing_push_enabled: true,
  marketing_sms_enabled: false,
  marketing_email_enabled: false,
  marketing_consent_acknowledged_at: null,
  marketing_consent_version: null,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00:00',
  quiet_hours_end: '07:00:00',
  quiet_hours_timezone: 'Asia/Manila',
};

it('Bug UX-146 — transactional payment, referral, Suki, and promo notification types use their saved push preference boundaries', async () => {
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock as typeof fetch;
  let inserted = 0;
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO notifications')) {
      inserted += 1;
      return {
        rows: [{
          id: `notification-${inserted}`,
          user_id: 'user-1',
          type: 'system',
          title: 'Notice',
          body: 'Body',
          data: {},
          is_read: false,
          created_at: new Date(),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('SELECT * FROM notification_preferences')) {
      return { rows: [disabledPrefs], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const types: NotificationType[] = ['payment', 'referral', 'suki', 'promo'];

  for (const type of types) {
    await createPushNotification({
      userId: 'user-1',
      type,
      title: 'Notice',
      body: 'Body',
    });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(inserted).toBe(4);
  expect(dbQueryMock.mock.calls.some(([sql]) => String(sql).includes('FROM push_tokens'))).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
