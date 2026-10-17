// CR-245 (D24 Option A, 2026-10-18): the real server.ts mounts the address
// search routes and its request log (morgan) never writes what a customer
// typed, their coordinates or the place they chose. The routes are POST with
// the details in a JSON body, so their lines hold only the route; a URL of
// the old query shape keeps the route and has the rest replaced with
// "[redacted]"; other URLs are logged as before. The real app is imported
// with its listener suppressed, as in HA-M2-376; database and Redis are the
// shared test mocks.
import request from 'supertest';
import type { Express } from 'express';
import { logger } from '../src/utils/logger';
import { importServerForTest } from './helpers/import-server';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('@sentry/node', () => ({ init: jest.fn(), setupExpressErrorHandler: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/socket.service', () => ({ initSocketServer: jest.fn() }));
jest.mock('../src/jobs/workers', () => ({ initScheduledJobs: jest.fn() }));
jest.mock('../src/jobs/queue', () => ({
  notificationQueue: { add: jest.fn() }, smsQueue: { add: jest.fn() },
  payoutQueue: { add: jest.fn() }, bookingQueue: { add: jest.fn() },
}));

let app: Express;

beforeAll(async () => {
  app = await importServerForTest({ DATA_EXPORT_DOWNLOAD_SECRET: 'cr-245-synthetic-export-secret-0123456789abcdef' });
}, 30_000);

it('Bug CR-245 — the request log keeps address search routes but never the typed text, the pin or the place ID', async () => {
  const info = jest.mocked(logger.info);
  info.mockClear();

  const token = '6f1c2a4e-8b3d-4c5e-9f70-112233445566';
  const unsigned = await request(app).post('/api/v1/geo/autocomplete').send({ q: '123 Gorordo Avenue', sessionToken: token });
  await request(app).post('/api/v1/geo/reverse').send({ lat: 10.3312345, lng: 123.9046789 });
  await request(app).post('/api/v1/geo/place').send({ placeId: 'ChIJcebuCityGorordo0001', sessionToken: token });
  // Backstop: URLs of the old query shape.
  await request(app).get(`/api/v1/geo/autocomplete?q=123%20Gorordo%20Avenue&sessionToken=${token}`);
  await request(app).get('/api/v1/geo/reverse?lat=10.3312345&lng=123.9046789');
  await request(app).get(`/api/v1/geo/place/ChIJcebuCityGorordo0001?sessionToken=${token}`);
  await request(app).get('/api/v1/addresses?label=Home');
  await new Promise(resolve => setImmediate(resolve));

  // Mounted and signed-in only.
  expect(unsigned.status).toBe(401);
  const lines = info.mock.calls.map(call => String(call[0]));
  const all = lines.join('\n');
  for (const secret of ['Gorordo', '10.3312345', '123.9046789', 'ChIJcebuCityGorordo0001', '6f1c2a4e']) {
    expect(all).not.toContain(secret);
  }
  expect(all).toContain('"POST /api/v1/geo/autocomplete HTTP/1.1" 401');
  expect(all).toContain('"POST /api/v1/geo/reverse HTTP/1.1" 401');
  expect(all).toContain('"POST /api/v1/geo/place HTTP/1.1" 401');
  expect(all).toContain('"GET /api/v1/geo/autocomplete?[redacted] HTTP/1.1" 401');
  expect(all).toContain('"GET /api/v1/geo/reverse?[redacted] HTTP/1.1" 401');
  expect(all).toContain('"GET /api/v1/geo/place/[redacted]?[redacted] HTTP/1.1" 401');
  expect(all).toContain('"GET /api/v1/addresses?label=Home HTTP/1.1" 401');
});
