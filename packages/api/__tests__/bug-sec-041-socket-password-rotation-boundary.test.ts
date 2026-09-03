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

it('Bug SEC-041 — Socket.IO rejects an admin while canonical password rotation is required', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'sec-041-socket-password-rotation-secret';
  dbQueryMock.mockResolvedValue({
    rows: [{
      role: 'admin',
      is_active: true,
      session_version: 4,
      must_rotate_password: true,
    }],
  });
  const httpServer = createServer();
  const socketServer = initSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as AddressInfo;
  const token = jwt.sign({
    userId: 'admin-sec-041',
    role: 'admin',
    sessionVersion: 4,
  }, process.env.JWT_SECRET, { expiresIn: '15m' });

  try {
    const error = await new Promise<Error>((resolve, reject) => {
      const client = createClient(`http://127.0.0.1:${address.port}`, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      client.once('connect', () => {
        client.close();
        reject(new Error('Rotation-flagged admin connected unexpectedly'));
      });
      client.once('connect_error', (connectError) => {
        client.close();
        resolve(connectError);
      });
    });
    expect(error.message).toBe('Password rotation required');
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  } finally {
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
