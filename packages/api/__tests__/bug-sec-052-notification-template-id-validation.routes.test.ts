import express from 'express';
import request from 'supertest';

const getTemplateByIdMock = jest.fn();
const updateTemplateMock = jest.fn();
const deleteTemplateMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/notification-template.service', () => ({
  getTemplateById: (...args: unknown[]) => getTemplateByIdMock(...args),
  updateTemplate: (...args: unknown[]) => updateTemplateMock(...args),
  deleteTemplate: (...args: unknown[]) => deleteTemplateMock(...args),
}));

import notificationTemplateRouter from '../src/routes/notification-template.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-052 - malformed notification-template IDs are rejected before any exact-record service access', async () => {
  const app = express();
  app.use(express.json());
  app.use('/notification-templates', notificationTemplateRouter);
  app.use(errorMiddleware);

  const [readResponse, updateResponse, deleteResponse] = await Promise.all([
    request(app).get('/notification-templates/not-a-template'),
    request(app).put('/notification-templates/not-a-template').send({
      titleTemplate: 'Reviewed title',
      reason: 'Testing invalid identifier rejection.',
    }),
    request(app).delete('/notification-templates/not-a-template').send({
      reason: 'Testing invalid identifier rejection.',
    }),
  ]);

  expect(readResponse.status).toBe(400);
  expect(updateResponse.status).toBe(400);
  expect(deleteResponse.status).toBe(400);
  expect(readResponse.body.error.message).toBe('Template ID must be a valid UUID.');
  expect(getTemplateByIdMock).not.toHaveBeenCalled();
  expect(updateTemplateMock).not.toHaveBeenCalled();
  expect(deleteTemplateMock).not.toHaveBeenCalled();
});
