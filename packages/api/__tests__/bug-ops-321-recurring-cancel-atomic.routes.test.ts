import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-321', role: 'admin' };
    next();
  },
}));

const clientQueryMock = jest.fn()
  .mockResolvedValueOnce({
    rows: [{ customer_id: 'customer-321', frequency: 'weekly' }], rowCount: 1,
  })
  .mockRejectedValueOnce(new Error('admin_actions unavailable'));
const transactionMock = jest.fn(async (callback: (client: { query: typeof clientQueryMock }) => Promise<unknown>) => callback({ query: clientQueryMock }));
const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args as [(client: { query: typeof clientQueryMock }) => Promise<unknown>]),
  },
}));

const notifyMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => notifyMock(...args),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import adminRouter from '../src/routes/admin.routes';

it('Bug OPS-321 — an admin recurring cancellation does not continue when its audit record cannot join the same transaction', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  const seriesId = '32132132-1321-4321-8321-321321321321';

  const response = await request(app)
    .post(`/admin/recurring/${seriesId}/cancel`)
    .send({ reason: 'Support verified that this schedule must stop.' });

  expect(response.status).toBe(500);
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(clientQueryMock).toHaveBeenCalledTimes(2);
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(notifyMock).not.toHaveBeenCalled();
});
