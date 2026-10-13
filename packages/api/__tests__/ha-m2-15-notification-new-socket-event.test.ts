// HA-M2-15 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// createPushNotification() stores the notification and then emits
// `notification:new` with the stored row's id to the user's own socket room,
// so an open app can show it without phone push (Android push is still off).
// Real Socket.IO server and client, real handshake (the account check reads
// the users table), and real notification rows on the guarded PostgreSQL
// fixture. Device push stays off through the fixture's stored preferences.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA, customerB, syntheticSecret,
} from './helpers/booking-participant-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { _setIoForTest, initSocketServer } from '../src/services/socket.service';
import { createPushNotification } from '../src/services/notification.service';
import { REALTIME_EVENTS } from '../src/services/realtime-events';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function connect(url: string, userId: string): Promise<ClientSocket> {
  const token = jwt.sign({ userId, role: 'customer', sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  return new Promise((resolve, reject) => {
    const client = createClient(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    client.once('connect', () => resolve(client));
    client.once('connect_error', error => { client.close(); reject(error); });
  });
}

it('HA-M2-15: createPushNotification emits notification:new with the stored id to that user only', async () => {
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

      const returned = await createPushNotification({
        userId: customerA,
        type: 'request_still_looking',
        title: 'Still looking for a pro',
        body: "We're still looking for a pro for your request.",
        data: { bookingId: '83000000-0000-4000-8000-000000000151' },
      });
      const payload = await received;

      const stored = await database.query(`SELECT id, type, title, body, data, created_at FROM notifications
        WHERE user_id = $1`, [customerA]);
      expect(stored.rows).toHaveLength(1);
      const row = stored.rows[0];
      expect(returned.id).toBe(row.id);
      expect(payload).toEqual({
        id: row.id,
        type: 'request_still_looking',
        title: 'Still looking for a pro',
        body: "We're still looking for a pro for your request.",
        data: row.data,
        createdAt: (row.created_at as Date).toISOString(),
      });
      expect(row.data).toEqual({
        type: 'request_still_looking',
        notificationType: 'request_still_looking',
        bookingId: '83000000-0000-4000-8000-000000000151',
      });
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
