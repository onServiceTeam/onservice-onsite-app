// HA-M2-142 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// `auth:refresh` with a valid token that belongs to ANOTHER user is refused:
// the server acks { ok: false }, sends auth:expired and disconnects the
// socket, and the socket's identity and expiry are never switched to the
// other account. Real Socket.IO server and client on the guarded PostgreSQL
// fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import {
  bookingIntegrationIt as it, customerA, customerB,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, nextEvent, startSocketServer, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-142: auth:refresh with another user\'s token is refused and disconnects the socket', async () => {
  await withRequestThreadDatabase(async () => {
    const server = await startSocketServer();
    let client: ClientSocket | undefined;
    try {
      const ownToken = accessToken(customerA, 'customer', 300);
      client = await connectSocket(server.url, ownToken);
      const socketId = client.id!;
      const serverSocket = server.io.of('/').sockets.get(socketId) as unknown as { userId?: string; tokenExp?: number };
      const ownExp = (jwt.decode(ownToken) as { exp: number }).exp;

      const expired = nextEvent<{ reason: string }>(client, 'auth:expired');
      const disconnected = nextEvent<string>(client, 'disconnect');
      const ack = await client.timeout(5000).emitWithAck('auth:refresh', accessToken(customerB, 'customer', 3600));

      expect(ack).toEqual({ ok: false });
      expect(await expired).toEqual({ reason: 'refresh_refused' });
      expect(await disconnected).toBe('io server disconnect');
      expect(serverSocket).toMatchObject({ userId: customerA, tokenExp: ownExp });
      expect(server.io.of('/').sockets.has(socketId)).toBe(false);
    } finally {
      client?.close();
      await server.close();
    }
  });
}, 90000);
