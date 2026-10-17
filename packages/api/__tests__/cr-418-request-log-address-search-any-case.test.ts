// CR-418 (D24 Option A, 2026-10-18 review): Express routes ignore letter
// case, so /API/V1/GEO/Place/<id> reaches the geo router like
// /api/v1/geo/place/<id>. The real server.ts request log (morgan) redacts
// address search URLs in any letter case, so a search, a pin or a place ID
// sent in a URL of the old query shape never reaches the log. The address
// search routes themselves are POST with a JSON body, so their own lines hold
// only the route. Database and Redis are the shared test mocks.
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
  app = await importServerForTest({ DATA_EXPORT_DOWNLOAD_SECRET: 'cr-418-synthetic-export-secret-0123456789abcdef' });
}, 30_000);

it('Bug CR-418 — the request log redacts address search URLs whatever their letter case', async () => {
  const info = jest.mocked(logger.info);
  info.mockClear();

  await request(app).get('/API/V1/GEO/Autocomplete?q=123%20Gorordo%20Avenue&sessionToken=6f1c2a4e-8b3d-4c5e-9f70-112233445566');
  await request(app).get('/api/v1/Geo/REVERSE?lat=10.3312345&lng=123.9046789');
  await request(app).post('/Api/V1/Geo/Place/ChIJcebuCityGorordo0001').send({ sessionToken: 'x' });
  await new Promise(resolve => setImmediate(resolve));

  const all = info.mock.calls.map(call => String(call[0])).join('\n');
  for (const secret of ['Gorordo', '10.3312345', '123.9046789', 'ChIJcebuCityGorordo0001', '6f1c2a4e']) {
    expect(all).not.toContain(secret);
  }
  expect(all).toContain('"GET /api/v1/geo/autocomplete?[redacted] HTTP/1.1"');
  expect(all).toContain('"GET /api/v1/geo/reverse?[redacted] HTTP/1.1"');
  expect(all).toContain('"POST /api/v1/geo/place/[redacted] HTTP/1.1"');
});
