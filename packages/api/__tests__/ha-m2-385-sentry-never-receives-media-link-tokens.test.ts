// HA-M2-385 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): when Sentry is configured,
// the real server.ts gives Sentry.init hooks that keep signed media links
// out of Sentry (critique L11): a performance transaction for
// /api/v1/job-media/file/<token> is dropped (Sentry samples 20% of requests
// in production and records the full URL), and an error event has every
// /api/v1/job-media/file/<token> string replaced with
// /api/v1/job-media/file/[redacted] while the rest of the event is kept.
// Other transactions pass through unchanged. The real app is imported with
// SENTRY_DSN set and its listener suppressed; @sentry/node is mocked only to
// capture the init options, and the hooks themselves run for real.
import * as Sentry from '@sentry/node';
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

const SIGNATURE = 'ab12'.repeat(16);
const TOKEN = `38500000-0000-4000-8000-000000000001.38500000-0000-4000-8000-000000000002.1999999999.${SIGNATURE}`;

type Hook = (event: Record<string, unknown>, hint?: unknown) => Record<string, unknown> | null;

it('HA-M2-385: Sentry drops media-link transactions and redacts media-link tokens from error events', async () => {
  await importServerForTest({ SENTRY_DSN: 'https://public@example.invalid/1' });
  const init = jest.mocked(Sentry.init);
  expect(init).toHaveBeenCalledTimes(1);
  const options = init.mock.calls[0]![0] as { beforeSend: Hook; beforeSendTransaction: Hook };

  const mediaTransaction = {
    type: 'transaction',
    transaction: 'GET /api/v1/job-media/file/:token',
    request: { method: 'GET', url: `https://api.onservice.ph/api/v1/job-media/file/${TOKEN}` },
    contexts: { trace: { data: { 'http.target': `/api/v1/job-media/file/${TOKEN}`, 'http.method': 'GET' } } },
  };
  expect(options.beforeSendTransaction(mediaTransaction)).toBeNull();

  const otherTransaction = {
    type: 'transaction',
    transaction: 'GET /api/v1/bookings/:id',
    request: { method: 'GET', url: 'https://api.onservice.ph/api/v1/bookings/38500000-0000-4000-8000-000000000003' },
  };
  expect(options.beforeSendTransaction(otherTransaction)).toBe(otherTransaction);

  const errorEvent = {
    level: 'error',
    exception: { values: [{ type: 'Error', value: 'stream failed' }] },
    request: {
      method: 'GET',
      url: `https://api.onservice.ph/api/v1/job-media/file/${TOKEN}`,
      headers: { referer: `https://app.onservice.ph/api/v1/job-media/file/${TOKEN}?player=1`, 'user-agent': 'synthetic' },
    },
    breadcrumbs: [{ category: 'http', data: { url: `/api/v1/job-media/file/${TOKEN}`, status_code: 404 } }],
    tags: { route: 'job-media' },
  };
  const sent = options.beforeSend(errorEvent, {});
  expect(sent).not.toBeNull();
  expect(JSON.stringify(sent)).not.toContain(SIGNATURE);
  expect(sent).toEqual({
    level: 'error',
    exception: { values: [{ type: 'Error', value: 'stream failed' }] },
    request: {
      method: 'GET',
      url: 'https://api.onservice.ph/api/v1/job-media/file/[redacted]',
      headers: { referer: 'https://app.onservice.ph/api/v1/job-media/file/[redacted]?player=1', 'user-agent': 'synthetic' },
    },
    breadcrumbs: [{ category: 'http', data: { url: '/api/v1/job-media/file/[redacted]', status_code: 404 } }],
    tags: { route: 'job-media' },
  });
}, 30_000);
