import express from 'express';
import request from 'supertest';

const updateSelectionMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'customer-903',
      role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/project.service', () => ({
  createProject: jest.fn(), listProjects: jest.fn(), getProjectDetail: jest.fn(), updateProject: jest.fn(),
  addMilestone: jest.fn(), updateMilestone: jest.fn(), deleteMilestone: jest.fn(), addSelection: jest.fn(),
  updateSelection: (...args: unknown[]) => updateSelectionMock(...args), deleteSelection: jest.fn(),
  addDocument: jest.fn(), deleteDocument: jest.fn(),
}));

import projectRouter from '../src/routes/project.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-903 — the project route validates and forwards a bounded planning-choice edit', async () => {
  updateSelectionMock.mockResolvedValue({ id: 'selection-903', value: 'Matte white' });
  const app = express();
  app.use(express.json());
  app.use('/projects', projectRouter);
  app.use(errorMiddleware);

  const accepted = await request(app).patch('/projects/selections/selection-903').send({
    category: 'Cabinetry',
    label: 'Finish',
    value: 'Matte white',
    detail: 'Sample MW-04',
  });
  expect(accepted.status).toBe(200);
  expect(updateSelectionMock).toHaveBeenCalledWith(
    'selection-903',
    { userId: 'customer-903', role: 'customer' },
    { category: 'Cabinetry', label: 'Finish', value: 'Matte white', detail: 'Sample MW-04' },
  );

  const rejected = await request(app).patch('/projects/selections/selection-903').send({ value: '   ' });
  expect(rejected.status).toBe(400);

  const authorityRejected = await request(app).patch('/projects/selections/selection-903').send({
    status: 'approved',
    bookingId: 'booking-903',
  });
  expect(authorityRejected.status).toBe(400);
  expect(updateSelectionMock).toHaveBeenCalledTimes(1);
});
