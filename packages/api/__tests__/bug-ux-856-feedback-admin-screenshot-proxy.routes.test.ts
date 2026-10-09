import express from 'express';
import request from 'supertest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dbQueryMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (req.headers.authorization !== 'Bearer admin-session') {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    (req as express.Request & { user: unknown }).user = {
      userId: '33333333-3333-4333-8333-333333333333',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({
  getUploadDir: (): string => process.env.TEST_FEEDBACK_UPLOAD_DIR as string,
}));

import feedbackAdminRouter from '../src/routes/feedback-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

const FEEDBACK_ID = '11111111-1111-4111-8111-111111111111';

it('Bug UX-856 — Admin screenshot retrieval requires authentication and a reference on the selected feedback record', async () => {
  const uploadRoot = mkdtempSync(path.join(tmpdir(), 'onservice-feedback-admin-'));
  process.env.TEST_FEEDBACK_UPLOAD_DIR = uploadRoot;
  const screenshotDirectory = path.join(uploadRoot, 'feedback');
  mkdirSync(screenshotDirectory, { recursive: true });
  writeFileSync(path.join(screenshotDirectory, 'evidence.png'), Buffer.from('private-image-bytes'));

  const app = express();
  app.use('/admin/feedback', feedbackAdminRouter);
  app.use(errorMiddleware);

  try {
    const anonymous = await request(app)
      .get(`/admin/feedback/${FEEDBACK_ID}/screenshots/evidence.png`);
    expect(anonymous.status).toBe(401);
    expect(dbQueryMock).not.toHaveBeenCalled();

    dbQueryMock.mockResolvedValueOnce({
      rows: [{ payload: { items: [{ screenshots: ['/uploads/feedback/other.png'] }] } }],
    });
    const unrelated = await request(app)
      .get(`/admin/feedback/${FEEDBACK_ID}/screenshots/evidence.png`)
      .set('Authorization', 'Bearer admin-session');
    expect(unrelated.status).toBe(404);

    dbQueryMock.mockResolvedValueOnce({
      rows: [{ payload: { items: [{ screenshots: ['/uploads/feedback/evidence.png'] }] } }],
    });
    const authorized = await request(app)
      .get(`/admin/feedback/${FEEDBACK_ID}/screenshots/evidence.png`)
      .set('Authorization', 'Bearer admin-session');

    expect(authorized.status).toBe(200);
    expect(authorized.headers['content-type']).toMatch(/^image\/png/);
    expect(authorized.headers['cache-control']).toBe('private, no-store');
    expect(authorized.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(authorized.body as Uint8Array).toString()).toBe('private-image-bytes');
    expect(dbQueryMock).toHaveBeenLastCalledWith(
      'SELECT payload FROM feedback_submissions WHERE id = $1',
      [FEEDBACK_ID],
    );
  } finally {
    delete process.env.TEST_FEEDBACK_UPLOAD_DIR;
    rmSync(uploadRoot, { recursive: true, force: true });
  }
});
