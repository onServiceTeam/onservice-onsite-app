import express from 'express';
import request from 'supertest';

const getRoleEvidenceByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/staff.service', () => ({
  getRoleEvidenceById: (...args: unknown[]) => getRoleEvidenceByIdMock(...args),
}));

import staffRouter from '../src/routes/staff.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-054 - an ordinary Admin cannot load exact Super Admin role-profile evidence', async () => {
  const app = express();
  app.use('/staff', staffRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(
    '/staff/roles/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );

  expect(response.status).toBe(403);
  expect(getRoleEvidenceByIdMock).not.toHaveBeenCalled();
});
