import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/messaging.service', () => ({}));

import { initSocketServer } from '../src/services/socket.service';

function openClient(url: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = createClient(url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    client.once('connect', () => resolve(client));
    client.once('connect_error', (error) => {
      client.close();
      reject(error);
    });
  });
}

it('Bug UX-566 — Socket.IO rejects a JWT after the account session generation changes', async () => {
  const priorSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'socket-session-generation-test-secret-32-bytes';
  let sessionVersion = 2;
  dbQueryMock.mockImplementation(async () => ({
    rows: [{ role: 'dpo', is_active: true, session_version: sessionVersion }],
  }));

  const httpServer = createServer();
  const socketServer = initSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const token = jwt.sign(
    { userId: 'dpo-1', role: 'dpo', sessionVersion: 2 },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );

  let activeClient: ClientSocket | undefined;
  try {
    activeClient = await openClient(url, token);
    expect(activeClient.connected).toBe(true);

    sessionVersion = 3;
    await expect(openClient(url, token)).rejects.toThrow('Session revoked');
  } finally {
    activeClient?.close();
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    if (priorSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorSecret;
  }
});
