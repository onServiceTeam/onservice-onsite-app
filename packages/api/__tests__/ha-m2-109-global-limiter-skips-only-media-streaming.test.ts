// HA-M2-109 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 34): the global rate limiter skips only the two D38
// streaming paths, PUT /api/v1/job-media/<uuid>/chunks/<n> and GET or HEAD
// /api/v1/job-media/file/<token>. With the global budget exhausted every
// other request, including the other job-media routes, a malformed chunk path
// and the file path with another method, still gets 429. The skipped file
// path is then limited by its own limiter, keyed on a hash of the token (the
// token itself never reaches Redis). Real express-rate-limit and
// rate-limit-redis; Redis answers every counter increment with 1000 hits.
import express from 'express';
import request from 'supertest';
import { rateLimitMiddleware } from '../src/middleware/rate-limit.middleware';
import jobMediaRouter from '../src/routes/job-media.routes';
import { redis } from '../src/config/redis.config';

jest.mock('../src/config/redis.config', () => ({
  redis: {
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    call: jest.fn().mockImplementation(async (...command: unknown[]) => {
      const operation = String(command[0] ?? '').toUpperCase();
      if (operation === 'SCRIPT') return 'ha-m2-109-script-sha';
      if (operation === 'EVALSHA') return [1000, 60_000]; // far over every limit
      return null;
    }),
  },
  bullMqConnection: { host: '127.0.0.1', port: 6379 },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const ID = '10900000-0000-4000-8000-000000000001';
const TOKEN = `${ID}.10900000-0000-4000-8000-000000000002.1999999999.${'ab'.repeat(32)}`;

it('HA-M2-109: the global limiter skips only the chunk and file paths', async () => {
  const app = express();
  app.use(rateLimitMiddleware);
  app.use((_req, res) => { res.status(200).send('passed'); });
  const agent = request(app);

  // Each request is built only when it is sent: supertest starts a server per
  // request, and one built but never sent would keep Jest from exiting.
  const skipped: Array<() => request.Test> = [
    () => agent.put(`/api/v1/job-media/${ID}/chunks/0`),
    () => agent.put(`/api/v1/job-media/${ID.toUpperCase()}/chunks/99999`),
    () => agent.get(`/api/v1/job-media/file/${TOKEN}`),
    () => agent.head(`/api/v1/job-media/file/${TOKEN}`),
    () => agent.get(`/api/v1/job-media/file/${TOKEN}?cache=1`),
  ];
  for (const send of skipped) expect((await send()).status).toBe(200);

  const limited: Array<() => request.Test> = [
    () => agent.post('/api/v1/job-media'),
    () => agent.get(`/api/v1/job-media/${ID}`),
    () => agent.post(`/api/v1/job-media/${ID}/complete`),
    () => agent.get(`/api/v1/job-media/${ID}/url`),
    () => agent.delete(`/api/v1/job-media/${ID}`),
    () => agent.get(`/api/v1/job-media/booking/${ID}`),
    () => agent.put(`/api/v1/job-media/${ID}/chunks/abc`),
    () => agent.put(`/api/v1/job-media/${ID}/chunks/123456`),
    () => agent.put('/api/v1/job-media/not-a-uuid/chunks/0'),
    () => agent.post(`/api/v1/job-media/file/${TOKEN}`),
    () => agent.get(`/api/v1/job-media/file/${TOKEN}/request-media.jpg`),
    () => agent.get('/api/v1/bookings'),
    () => agent.put(`/api/v1/uploads/${ID}/chunks/0`),
  ];
  for (const send of limited) expect((await send()).status).toBe(429);

  // The skipped file path answers to its own limiter instead.
  const mediaApp = express();
  mediaApp.use('/api/v1/job-media', jobMediaRouter);
  (redis.call as jest.Mock).mockClear();
  const ownLimit = await request(mediaApp).get(`/api/v1/job-media/file/${TOKEN}`);
  expect(ownLimit.status).toBe(429);
  const keys = (redis.call as jest.Mock).mock.calls
    .filter(call => String(call[0]).toUpperCase() === 'EVALSHA')
    .map(call => String(call[3]));
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^rl:jobmedia:file:t:[0-9a-f]{32}$/);
  expect(keys[0]).not.toContain(ID);
});
