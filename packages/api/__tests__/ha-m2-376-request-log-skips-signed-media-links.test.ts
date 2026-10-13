// HA-M2-376 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): the real server.ts request
// log (morgan) never writes a signed media link, because the token in its
// path works as a viewing link (critique L11 and the P3 correction "do not
// log the /api/v1/job-media/file/ path in morgan"). GET and HEAD on
// /api/v1/job-media/file/<token>, with or without a query string, write no
// log line; every other request, including the other job-media routes,
// still does. The real app is imported with its listener suppressed, as in
// server-health-smoke.test.ts; database and Redis are the shared mocks.
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

const MEDIA_ID = '37600000-0000-4000-8000-000000000001';
const VIEWER_ID = '37600000-0000-4000-8000-000000000002';
const SIGNATURE = 'c0ffee'.repeat(10) + 'beef';
const TOKEN = `${MEDIA_ID}.${VIEWER_ID}.1999999999.${SIGNATURE}`;

let app: Express;

beforeAll(async () => {
  app = await importServerForTest({ DATA_EXPORT_DOWNLOAD_SECRET: 'ha-m2-376-synthetic-export-secret-0123456789' });
}, 30_000);

it('HA-M2-376: the request log skips signed media links and logs every other request', async () => {
  const info = jest.mocked(logger.info);
  info.mockClear();

  await request(app).get(`/api/v1/job-media/file/${TOKEN}`);
  await request(app).head(`/api/v1/job-media/file/${TOKEN}`);
  await request(app).get(`/api/v1/job-media/file/${TOKEN}?player=1`);
  await request(app).get(`/api/v1/job-media/${MEDIA_ID}`); // 401, no sign-in
  await request(app).post(`/api/v1/job-media/${MEDIA_ID}/complete`);
  await new Promise(resolve => setImmediate(resolve));

  const lines = info.mock.calls.map(call => String(call[0]));
  expect(lines.join('\n')).not.toContain(SIGNATURE);
  expect(lines.join('\n')).not.toContain('/api/v1/job-media/file/');
  const mediaLines = lines.filter(line => line.includes('/api/v1/job-media/'));
  expect(mediaLines).toHaveLength(2);
  expect(mediaLines[0]).toContain(`"GET /api/v1/job-media/${MEDIA_ID} HTTP/1.1" 401`);
  expect(mediaLines[1]).toContain(`"POST /api/v1/job-media/${MEDIA_ID}/complete HTTP/1.1" 401`);
});
