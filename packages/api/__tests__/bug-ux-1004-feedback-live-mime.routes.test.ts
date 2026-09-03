import express from 'express';
import request from 'supertest';

const mockValidateFile = jest.fn().mockRejectedValue(
  Object.assign(new Error('PNG uploads are disabled by System Settings.'), {
    statusCode: 400,
    isOperational: true,
  }),
);

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
  validateAndNormalize: jest.fn(), createFeedback: jest.fn(), listFeedback: jest.fn(),
  toMarkdown: jest.fn(), toCsv: jest.fn(),
}));
jest.mock('../src/services/upload.service', () => ({
  validateFile: (...args: unknown[]) => mockValidateFile(...args),
  assertImageMagicBytes: jest.fn(),
  getUploadDir: jest.fn(() => 'unused-after-rejection'),
}));

import feedbackRouter from '../src/routes/feedback.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-1004 — public tester-feedback screenshots obey the live image MIME selection before storage', async () => {
  const app = express();
  app.use('/feedback', feedbackRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .post('/feedback/upload')
    .attach('file', Buffer.from('image bytes'), { filename: 'screen.png', contentType: 'image/png' });

  expect(response.status).toBe(400);
  expect(response.body.error.message).toMatch(/disabled by System Settings/i);
  expect(mockValidateFile).toHaveBeenCalledWith('screen.png', 'image/png', expect.any(Number));
});
