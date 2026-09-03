import express from 'express';
import request from 'supertest';

const getTemplateByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/services/notification-template.service', () => ({
  getTemplateById: (...args: unknown[]) => getTemplateByIdMock(...args),
}));

import notificationTemplateRouter from '../src/routes/notification-template.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-053 - customer accounts cannot load an exact Admin notification-template record', async () => {
  const app = express();
  app.use('/notification-templates', notificationTemplateRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(
    '/notification-templates/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );

  expect(response.status).toBe(403);
  expect(getTemplateByIdMock).not.toHaveBeenCalled();
});
