import express from 'express';
import request from 'supertest';

const getTemplateByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '00000000-0000-4000-8000-000000000368',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/notification-template.service', () => ({
  getTemplateById: (...args: unknown[]) => getTemplateByIdMock(...args),
  formatTemplate: (value: unknown) => value,
}));

import notificationTemplateRouter from '../src/routes/notification-template.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-368 — template detail reads do not require a mutation reason body', async () => {
  const templateId = '00000000-0000-4000-8000-000000000369';
  getTemplateByIdMock.mockResolvedValue({ id: templateId, slug: 'booking_matched' });

  const app = express();
  app.use(express.json());
  app.use('/notification-templates', notificationTemplateRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(`/notification-templates/${templateId}`);

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: templateId, slug: 'booking_matched' });
  expect(getTemplateByIdMock).toHaveBeenCalledWith(templateId);
});
