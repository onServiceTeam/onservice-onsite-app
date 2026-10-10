import express from 'express';
import request from 'supertest';

const getRoleEvidenceByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/staff.service', () => ({
  getRoleEvidenceById: (...args: unknown[]) => getRoleEvidenceByIdMock(...args),
}));

import staffRouter from '../src/routes/staff.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug OPS-421 - the exact Staff role route returns the requested retained role profile', async () => {
  const roleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  getRoleEvidenceByIdMock.mockResolvedValueOnce({
    id: roleId, name: 'case_reviewer', deleted_at: null, active_staff_count: '2',
  });
  const app = express();
  app.use('/staff', staffRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(`/staff/roles/${roleId}`);

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: roleId, name: 'case_reviewer' });
  expect(getRoleEvidenceByIdMock).toHaveBeenCalledWith(roleId);
});
