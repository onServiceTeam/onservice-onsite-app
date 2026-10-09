import express from 'express';
import request from 'supertest';

const createTemplateMock = jest.fn();
const updateTemplateMock = jest.fn();
const deleteTemplateMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '00000000-0000-4000-8000-000000000035',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/notification-template.service', () => ({
  createTemplate: (...args: unknown[]) => createTemplateMock(...args),
  updateTemplate: (...args: unknown[]) => updateTemplateMock(...args),
  deleteTemplate: (...args: unknown[]) => deleteTemplateMock(...args),
  formatTemplate: (value: unknown) => value,
}));

import notificationTemplateRouter from '../src/routes/notification-template.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-035 — ordinary admins cannot publish any notification-template lifecycle change', async () => {
  const app = express();
  app.use(express.json());
  app.use('/notification-templates', notificationTemplateRouter);
  app.use(errorMiddleware);

  const templateId = '00000000-0000-4000-8000-000000000036';
  const responses = await Promise.all([
    request(app).post('/notification-templates').send({
      slug: 'booking_reminder',
      titleTemplate: 'Booking reminder',
      bodyTemplate: 'Your booking starts tomorrow morning.',
      type: 'booking_update',
      channel: 'in_app',
      isActive: true,
      reason: 'Creating reviewed booking reminder copy.',
    }),
    request(app).put(`/notification-templates/${templateId}`).send({
      titleTemplate: 'Updated booking reminder',
      reason: 'Updating reviewed booking reminder copy.',
    }),
    request(app).put(`/notification-templates/${templateId}`).send({
      isActive: false,
      reason: 'Disabling copy while operations reviews it.',
    }),
    request(app).delete(`/notification-templates/${templateId}`).send({
      reason: 'Removing obsolete reference-only message copy.',
    }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
  expect(createTemplateMock).not.toHaveBeenCalled();
  expect(updateTemplateMock).not.toHaveBeenCalled();
  expect(deleteTemplateMock).not.toHaveBeenCalled();
});
