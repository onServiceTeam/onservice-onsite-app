import express from 'express';
import request from 'supertest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: class RedisStoreMock {},
}));
jest.mock('../src/config/redis.config', () => ({ redis: { call: jest.fn() } }));
jest.mock('../src/services/feedback.service', () => ({
  validateAndNormalize: jest.fn(),
  createFeedback: jest.fn(),
  listFeedback: jest.fn().mockResolvedValue([]),
  toMarkdown: jest.fn(),
  toCsv: jest.fn(),
}));
jest.mock('../src/services/upload.service', () => ({
  validateFile: jest.fn().mockResolvedValue(undefined),
  assertImageMagicBytes: jest.fn(),
  getUploadDir: (): string => process.env.TEST_FEEDBACK_UPLOAD_DIR as string,
}));

import feedbackRouter from '../src/routes/feedback.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

const EXPORT_KEY = '7f3a9f75211e46cba4522ea9dc344c59b7d84739f5e54ee4';

it('Bug UX-857 — private feedback screenshot export accepts the export key only through a protected request', async () => {
  const uploadRoot = mkdtempSync(path.join(tmpdir(), 'onservice-feedback-export-'));
  process.env.TEST_FEEDBACK_UPLOAD_DIR = uploadRoot;
  process.env.FEEDBACK_EXPORT_KEY = EXPORT_KEY;
  const screenshotDirectory = path.join(uploadRoot, 'feedback');
  mkdirSync(screenshotDirectory, { recursive: true });
  writeFileSync(path.join(screenshotDirectory, 'export.webp'), Buffer.from('export-image-bytes'));

  const app = express();
  app.use('/feedback', feedbackRouter);
  app.use(errorMiddleware);

  try {
    const anonymous = await request(app).get('/feedback/export-screenshot/export.webp');
    expect(anonymous.status).toBe(401);

    const querySecret = await request(app)
      .get(`/feedback/export-screenshot/export.webp?key=${EXPORT_KEY}`);
    expect(querySecret.status).toBe(401);

    const queryMetadata = await request(app)
      .get(`/feedback/export.json?key=${EXPORT_KEY}`);
    expect(queryMetadata.status).toBe(401);

    const authorizedMetadata = await request(app)
      .get('/feedback/export.json')
      .set('x-feedback-key', EXPORT_KEY);
    expect(authorizedMetadata.status).toBe(200);
    expect(authorizedMetadata.body).toEqual({ success: true, count: 0, submissions: [] });

    const authorized = await request(app)
      .get('/feedback/export-screenshot/export.webp')
      .set('x-feedback-key', EXPORT_KEY);
    expect(authorized.status).toBe(200);
    expect(authorized.headers['content-type']).toMatch(/^image\/webp/);
    expect(authorized.headers['cache-control']).toBe('private, no-store');
    expect(authorized.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(authorized.body as Uint8Array).toString()).toBe('export-image-bytes');

    const traversal = await request(app)
      .get('/feedback/export-screenshot/not-an-image.txt')
      .set('x-feedback-key', EXPORT_KEY);
    expect(traversal.status).toBe(404);
  } finally {
    delete process.env.TEST_FEEDBACK_UPLOAD_DIR;
    delete process.env.FEEDBACK_EXPORT_KEY;
    rmSync(uploadRoot, { recursive: true, force: true });
  }
});
