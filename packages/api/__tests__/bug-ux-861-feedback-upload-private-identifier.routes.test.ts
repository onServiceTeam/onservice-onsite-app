import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
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
  listFeedback: jest.fn(),
  toMarkdown: jest.fn(),
  toCsv: jest.fn(),
}));
jest.mock('../src/services/upload.service', () => ({
  validateFileSync: jest.fn(),
  assertImageMagicBytes: jest.fn(),
  getUploadDir: (): string => process.env.TEST_FEEDBACK_UPLOAD_DIR as string,
}));

import feedbackRouter from '../src/routes/feedback.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-861 — public feedback upload returns a stable storage identifier instead of a public host URL', async () => {
  const uploadRoot = mkdtempSync(path.join(tmpdir(), 'onservice-feedback-upload-'));
  process.env.TEST_FEEDBACK_UPLOAD_DIR = uploadRoot;
  const app = express();
  app.use('/feedback', feedbackRouter);
  app.use(errorMiddleware);

  try {
    const response = await request(app)
      .post('/feedback/upload')
      .set('Host', 'attacker.example')
      .attach('file', Buffer.from('image bytes'), { filename: 'screen.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.url).toMatch(/^\/uploads\/feedback\/[0-9a-f-]+\.png$/);
    expect(response.body.url).not.toContain('attacker.example');
    expect(response.body.url).not.toMatch(/^https?:\/\//);
  } finally {
    delete process.env.TEST_FEEDBACK_UPLOAD_DIR;
    rmSync(uploadRoot, { recursive: true, force: true });
  }
});
