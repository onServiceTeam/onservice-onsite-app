import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as createClient } from 'socket.io-client';

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/messaging.service', () => ({}));

import { initSocketServer } from '../src/services/socket.service';

it('Bug SEC-040 — Socket.IO rejects a temporary 2FA setup token before canonical account access', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'sec-040-socket-setup-token-secret';
  const httpServer = createServer();
  const socketServer = initSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const setupToken = jwt.sign({
    userId: 'admin-sec-040',
    role: 'admin',
    sessionVersion: 1,
    type: 'pre_auth_2fa_setup',
  }, process.env.JWT_SECRET, { expiresIn: '30m' });

  try {
    const error = await new Promise<Error>((resolve, reject) => {
      const client = createClient(`http://127.0.0.1:${address.port}`, {
        auth: { token: setupToken },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      client.once('connect', () => {
        client.close();
        reject(new Error('Temporary setup token connected unexpectedly'));
      });
      client.once('connect_error', (connectError) => {
        client.close();
        resolve(connectError);
      });
    });
    expect(error.message).toBe('Invalid token type');
    expect(dbQueryMock).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
