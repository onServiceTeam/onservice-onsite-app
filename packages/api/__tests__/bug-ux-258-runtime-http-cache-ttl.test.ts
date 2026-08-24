import express from 'express';
import request from 'supertest';

const cacheGetMock = jest.fn();
const cacheSetMock = jest.fn();

jest.mock('../src/services/cache.service', () => ({
  cacheGet: (...args: unknown[]) => cacheGetMock(...args),
  cacheSet: (...args: unknown[]) => cacheSetMock(...args),
  buildCacheKey: (...parts: unknown[]) => `test:${parts.join(':')}`,
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cacheMiddleware } from '../src/middleware/cache.middleware';

it('Bug UX-258 — HTTP cache middleware applies a runtime-resolved TTL to Redis and response headers', async () => {
  cacheGetMock.mockResolvedValueOnce(null);
  cacheSetMock.mockResolvedValueOnce(undefined);
  const ttlResolver = jest.fn(async () => 137);
  const app = express();
  app.get('/catalog', cacheMiddleware(ttlResolver), (_req, res) => {
    res.json({ success: true });
  });

  const response = await request(app).get('/catalog');

  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('public, max-age=137');
  expect(ttlResolver).toHaveBeenCalledTimes(1);
  expect(cacheSetMock).toHaveBeenCalledWith(
    expect.any(String),
    { body: { success: true }, statusCode: 200 },
    137,
  );
});
