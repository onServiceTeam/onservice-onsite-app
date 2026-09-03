import express from 'express';
import request from 'supertest';

const blockIpMock = jest.fn();
const unblockIpMock = jest.fn();
const listBlockedIpsMock = jest.fn();
const listSecurityEventsMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '34000000-0000-4000-8000-000000000034',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/security.service', () => ({
  blockIp: (...args: unknown[]) => blockIpMock(...args),
  unblockIp: (...args: unknown[]) => unblockIpMock(...args),
  listBlockedIps: (...args: unknown[]) => listBlockedIpsMock(...args),
  listSecurityEvents: (...args: unknown[]) => listSecurityEventsMock(...args),
  formatBlockedIp: (value: unknown) => value,
  formatSecurityEvent: (value: unknown) => value,
}));
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-034 — Admin IP security routes reject malformed inputs and pass only reasoned, bounded operations', async () => {
  blockIpMock.mockResolvedValue({ id: 'block-34', ipAddress: '203.0.113.34' });
  unblockIpMock.mockResolvedValue(true);
  listBlockedIpsMock.mockResolvedValue({ items: [], total: 0 });
  listSecurityEventsMock.mockResolvedValue({ items: [], total: 0 });

  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const invalidBlock = await request(app).post('/admin/blocked-ips').send({
    ipAddress: 'not-an-ip',
    reason: 'short',
    expiresInHours: 0,
  });
  const invalidUnblock = await request(app)
    .post('/admin/blocked-ips/999.1.1.1/unblock')
    .send({ reason: 'Verified by support after a detailed review.' });
  const invalidEvents = await request(app)
    .get('/admin/security-events?page=-1&eventType=DROP%20TABLE&ipAddress=999.1.1.1');

  expect([invalidBlock.status, invalidUnblock.status, invalidEvents.status]).toEqual([400, 400, 400]);
  expect(blockIpMock).not.toHaveBeenCalled();
  expect(unblockIpMock).not.toHaveBeenCalled();
  expect(listSecurityEventsMock).not.toHaveBeenCalled();

  const reason = 'Repeated credential attacks confirmed in the security timeline.';
  const validBlock = await request(app).post('/admin/blocked-ips').send({
    ipAddress: '203.0.113.34',
    reason,
    expiresInHours: 24,
  });
  const validUnblock = await request(app)
    .post('/admin/blocked-ips/2001%3Adb8%3A%3A34/unblock')
    .send({ reason: 'Verified shared-office address after customer support review.' });
  const validEvents = await request(app).get(
    '/admin/security-events?page=2&pageSize=50&eventType=ip_blocked&ipAddress=203.0.113.34',
  );

  expect(validBlock.status).toBe(201);
  expect(blockIpMock).toHaveBeenCalledWith({
    ipAddress: '203.0.113.34',
    reason,
    blockedBy: '34000000-0000-4000-8000-000000000034',
    expiresInHours: 24,
  });
  expect(validUnblock.status).toBe(200);
  expect(unblockIpMock).toHaveBeenCalledWith(
    '2001:db8::34',
    '34000000-0000-4000-8000-000000000034',
    'Verified shared-office address after customer support review.',
  );
  expect(validEvents.status).toBe(200);
  expect(listSecurityEventsMock).toHaveBeenCalledWith(2, 50, {
    userId: undefined,
    eventType: 'ip_blocked',
    ipAddress: '203.0.113.34',
  });
});
