import express from 'express';
import request from 'supertest';

const uploadPrivateDocumentMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'customer-907', role: 'customer' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  uploadRateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/project.service', () => ({
  createProject: jest.fn(), listProjects: jest.fn(), getProjectDetail: jest.fn(), updateProject: jest.fn(),
  addMilestone: jest.fn(), updateMilestone: jest.fn(), deleteMilestone: jest.fn(), addSelection: jest.fn(),
  updateSelection: jest.fn(), deleteSelection: jest.fn(), addDocument: jest.fn(), deleteDocument: jest.fn(),
  createDocumentAccessLink: jest.fn(), getDocumentDownload: jest.fn(),
  uploadPrivateDocument: (...args: unknown[]) => uploadPrivateDocumentMock(...args),
}));

import projectRouter from '../src/routes/project.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-907 — the multipart project route forwards one bounded owner image and rejects missing files', async () => {
  uploadPrivateDocumentMock.mockResolvedValue({ id: 'document-907', fileUrl: null });
  const app = express();
  app.use('/projects', projectRouter);
  app.use(errorMiddleware);

  const accepted = await request(app)
    .post('/projects/project-907/documents/upload')
    .field('label', 'Ground-floor plan')
    .field('docType', 'blueprint')
    .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0x00]), { filename: 'plan.jpg', contentType: 'image/jpeg' });
  expect(accepted.status).toBe(201);
  expect(uploadPrivateDocumentMock).toHaveBeenCalledWith(
    'project-907',
    { userId: 'customer-907', role: 'customer' },
    expect.objectContaining({ label: 'Ground-floor plan', docType: 'blueprint', originalname: 'plan.jpg', mimetype: 'image/jpeg', size: 4 }),
  );

  const rejected = await request(app)
    .post('/projects/project-907/documents/upload')
    .field('label', 'No file')
    .field('docType', 'other');
  expect(rejected.status).toBe(400);
  expect(uploadPrivateDocumentMock).toHaveBeenCalledTimes(1);
});
