// HA-M2-141 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// an app that refreshes its access token sends it on the open socket with
// `auth:refresh(token, ack)`. The server runs the same checks as the
// handshake, acks { ok: true, exp } and moves the socket's token expiry to the
// new token's, so the 60-second expiry check keeps the connection instead of
// dropping it when the first token runs out. Real Socket.IO server and client
// on the guarded PostgreSQL fixture; the expiry is read from the server's own
// socket object.
import type { Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, startSocketServer, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-141: auth:refresh with a fresh token for the same user extends the socket token expiry', async () => {
  await withRequestThreadDatabase(async () => {
    const server = await startSocketServer();
    let client: ClientSocket | undefined;
    try {
      const firstToken = accessToken(customerA, 'customer', 60);
      const firstExp = (jwt.decode(firstToken) as { exp: number }).exp;
      client = await connectSocket(server.url, firstToken);
      const serverSocket = () => server.io.of('/').sockets.get(client!.id!) as unknown as { tokenExp?: number };
      expect(serverSocket().tokenExp).toBe(firstExp);

      const freshToken = accessToken(customerA, 'customer', 3600);
      const freshExp = (jwt.decode(freshToken) as { exp: number }).exp;
      const ack = await client.timeout(5000).emitWithAck('auth:refresh', freshToken);

      expect(ack).toEqual({ ok: true, exp: freshExp });
      expect(freshExp).toBeGreaterThan(firstExp);
      expect(serverSocket().tokenExp).toBe(freshExp);
      expect(client.connected).toBe(true);
    } finally {
      client?.close();
      await server.close();
    }
  });
}, 90000);
