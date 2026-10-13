// HA-M2-16 (customer human audit 2026-10-13, D38 Milestone 2, package P1,
// added by the P1 fixer for the review finding that this path had no test):
// deliverStoredNotificationPush(), the hand-over for notification rows another
// service already stored in its own transaction (dispute participant updates
// and admin dispute messages today), emits `notification:new` with that row's
// id to that user's socket room only. Without this, a dispute decision would
// reach an open app only through phone push, which is off on Android.
//
// The row is inserted the way dispute.service stores a participant update
// (insertDisputeParticipantNotification: RETURNING id only, no created_at),
// and the hand-over is called the way dispute.service calls it (no
// createdAt), so the payload's createdAt is the emit time, as
// realtime-events.ts documents.
// Real Socket.IO server and client, real handshake (the account check reads
// the users table), real notification rows on the guarded PostgreSQL fixture.
// Device push stays off through the fixture's stored preferences.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, bookingA, customerA, customerB, syntheticSecret,
} from './helpers/booking-participant-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { _setIoForTest, initSocketServer } from '../src/services/socket.service';
import { deliverStoredNotificationPush } from '../src/services/notification.service';
import { REALTIME_EVENTS } from '../src/services/realtime-events';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const disputeId = '86000000-0000-4000-8000-000000000161';

function connect(url: string, userId: string): Promise<ClientSocket> {
  const token = jwt.sign({ userId, role: 'customer', sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  return new Promise((resolve, reject) => {
    const client = createClient(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    client.once('connect', () => resolve(client));
    client.once('connect_error', error => { client.close(); reject(error); });
  });
}

it('HA-M2-16: deliverStoredNotificationPush emits notification:new with the stored row id to that user only', async () => {
  await withRequestEngineDatabase(async database => {
    const httpServer = createServer();
    const socketServer = initSocketServer(httpServer);
    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    let customer: ClientSocket | undefined;
    let otherCustomer: ClientSocket | undefined;
    try {
      customer = await connect(url, customerA);
      otherCustomer = await connect(url, customerB);
      const strayEvents: unknown[] = [];
      otherCustomer.on(REALTIME_EVENTS.NOTIFICATION_NEW, payload => strayEvents.push(payload));
      const received = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('notification:new was not received')), 5000);
        customer!.once(REALTIME_EVENTS.NOTIFICATION_NEW, payload => { clearTimeout(timer); resolve(payload); });
      });

      // Stored the way dispute.service stores a participant update.
      const title = 'Dispute decision';
      const body = 'The support team has decided your dispute.';
      const handOverData = { disputeId, bookingId: bookingA, decision: 'refund_customer' };
      const inserted = await database.query<{ id: string }>(`INSERT INTO notifications (user_id, type, title, body, data)
        VALUES ($1, 'dispute_update', $2, $3, $4::jsonb) RETURNING id`,
      [customerA, title, body, JSON.stringify({ type: 'dispute_update', notificationType: 'dispute_update', ...handOverData })]);
      const notificationId = inserted.rows[0]!.id;

      const emittedAfter = Date.now();
      await deliverStoredNotificationPush({
        notificationId, userId: customerA, type: 'dispute_update', title, body, data: handOverData,
      });
      const payload = await received;
      const emittedBefore = Date.now();

      const stored = await database.query('SELECT id, type, title, body, data FROM notifications WHERE user_id = $1', [customerA]);
      expect(stored.rows).toHaveLength(1);
      const row = stored.rows[0];
      const { createdAt, ...rest } = payload;
      expect(rest).toEqual({ id: row.id, type: row.type, title: row.title, body: row.body, data: row.data });
      expect(rest.id).toBe(notificationId);
      // No stored time was handed over, so createdAt is the emit time.
      expect(typeof createdAt).toBe('string');
      const createdAtMs = Date.parse(createdAt as string);
      expect(createdAtMs).toBeGreaterThanOrEqual(emittedAfter);
      expect(createdAtMs).toBeLessThanOrEqual(emittedBefore);
      // Give a misrouted emit time to arrive before checking the other user.
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(strayEvents).toEqual([]);
    } finally {
      customer?.close();
      otherCustomer?.close();
      await new Promise<void>(resolve => socketServer.close(() => resolve()));
      _setIoForTest(null);
    }
  });
}, 90000);
