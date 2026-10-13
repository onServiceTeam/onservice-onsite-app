// HA-M2-17 (customer human audit 2026-10-13, D38 Milestone 2, package P1,
// added by the P1 fixer for the review finding that this mapping had no
// test): the eight D38 request and quote notification types (merged plan 2.5
// plus critique 2.5) follow the user's "Booking updates" push preference, not
// "System". A user who turned Booking updates off gets no device push for
// them even with System on; a user with Booking updates on gets every one even
// with System off. The inbox row is stored either way.
//
// Real createPushNotification(), real notification rows, real stored
// preferences and a real push_tokens table (migration 016) on the guarded
// PostgreSQL fixture. The only stand-in is a local function in place of the
// Expo push API (it accepts only the Expo URL and never touches the network);
// it replaces the fixture's fetch guard for the test body and is put back
// afterwards, so the guard's "no network" check still runs.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import { readMigration, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { createPushNotification, type NotificationType } from '../src/services/notification.service';
import { logger } from '../src/utils/logger';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const D38_TYPES: readonly NotificationType[] = [
  'job_request_reopened', 'quote_declined', 'quote_not_selected', 'quote_withdrawn',
  'job_request_cancelled', 'request_reopened', 'request_still_looking', 'request_ops_review',
];
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const bookingId = '83000000-0000-4000-8000-000000000171';

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

it('HA-M2-17: the D38 request and quote notifications follow the Booking updates push preference, not System', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(readMigration('016_create_push_tokens.sql'));
    await database.query(`INSERT INTO push_tokens (user_id, token, platform)
      VALUES ($1, 'ExponentPushToken[synthetic-ha-m2-17]', 'android')`, [customerA]);

    const pushedTypes: string[] = [];
    const expo = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
      if (url !== EXPO_PUSH_URL) throw new Error(`Unexpected network call to ${String(url)}`);
      const messages = JSON.parse(String(init?.body)) as { data: { type: string } }[];
      for (const message of messages) pushedTypes.push(message.data.type);
      return { json: async () => ({ data: messages.map(() => ({ status: 'ok' })) }) };
    });
    const info = logger.info as jest.Mock;
    const suppressedTypes = (): string[] => info.mock.calls
      .filter(([message]) => message === 'Push suppressed by notification preferences')
      .map(([, meta]) => (meta as { type: string }).type);

    async function sendEveryD38Type(): Promise<void> {
      info.mockClear();
      pushedTypes.length = 0;
      for (const type of D38_TYPES) {
        await createPushNotification({ userId: customerA, type, title: `Title for ${type}`, body: 'Synthetic body', data: { bookingId } });
      }
      // createPushNotification sends the push in the background: wait until
      // every one of the eight was either suppressed or sent.
      await waitFor(() => suppressedTypes().length + pushedTypes.length === D38_TYPES.length, 'eight push decisions');
    }

    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = expo as unknown as typeof fetch;
    try {
      // Booking updates off, System on: no device push for any of them.
      await database.query(`UPDATE notification_preferences SET booking_updates = FALSE, system = TRUE
        WHERE user_id = $1`, [customerA]);
      await sendEveryD38Type();
      expect(pushedTypes).toEqual([]);
      expect([...suppressedTypes()].sort()).toEqual([...D38_TYPES].sort());

      // Booking updates on, System off: every one is pushed.
      await database.query(`UPDATE notification_preferences SET booking_updates = TRUE, system = FALSE
        WHERE user_id = $1`, [customerA]);
      await sendEveryD38Type();
      expect(suppressedTypes()).toEqual([]);
      expect([...pushedTypes].sort()).toEqual([...D38_TYPES].sort());
      expect(expo).toHaveBeenCalledTimes(D38_TYPES.length);
    } finally {
      globalThis.fetch = fixtureFetch;
    }

    // The inbox row is stored in both rounds, pushed or not.
    const stored = await database.query<{ type: string; count: number }>(`SELECT type, count(*)::int AS count
      FROM notifications WHERE user_id = $1 GROUP BY type ORDER BY type`, [customerA]);
    expect(stored.rows).toEqual([...D38_TYPES].sort().map(type => ({ type, count: 2 })));
  });
}, 90000);
