// CR-246 (D24 Option A, 2026-10-18): when Sentry is configured, the real
// server.ts gives Sentry.init hooks that keep address search detail and the
// Google server key out of Sentry. An error event has Google's key= and
// latlng= URL values and any /api/v1/geo/ query or place ID replaced with
// "[redacted]"; a performance sample of an address search request, or one
// that recorded a call to Google, is dropped. Other events pass through as
// the same object, and the media-link rules of HA-M2-385 still apply. The
// hooks run for real; @sentry/node is mocked only to capture them.
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

type Hook = (event: Record<string, unknown>, hint?: unknown) => Record<string, unknown> | null;
const FAKE_KEY = 'TESTONLY_fake_google_maps_server_key_0000';

it('Bug CR-246 — Sentry hooks redact the Google key, pins and searches from errors and drop address search transactions', async () => {
  await importServerForTest({ SENTRY_DSN: 'https://public@example.invalid/1' });
  const init = jest.mocked(Sentry.init);
  expect(init).toHaveBeenCalledTimes(1);
  const options = init.mock.calls[0]![0] as { beforeSend: Hook; beforeSendTransaction: Hook };

  const geoTransaction = {
    type: 'transaction',
    transaction: 'GET /api/v1/geo/autocomplete',
    request: { method: 'GET', url: 'https://api.onservice.ph/api/v1/geo/autocomplete?q=Gorordo&sessionToken=abc' },
  };
  expect(options.beforeSendTransaction(geoTransaction)).toBeNull();
  const googleSpanTransaction = {
    type: 'transaction',
    transaction: 'GET /api/v1/bookings/:id',
    spans: [{ description: 'GET https://maps.googleapis.com/maps/api/geocode/json' }],
  };
  expect(options.beforeSendTransaction(googleSpanTransaction)).toBeNull();
  const otherTransaction = { type: 'transaction', transaction: 'GET /api/v1/bookings/:id' };
  expect(options.beforeSendTransaction(otherTransaction)).toBe(otherTransaction);

  const errorEvent = {
    level: 'error',
    request: { method: 'GET', url: 'https://api.onservice.ph/api/v1/geo/place/ChIJcebuCityGorordo0001?sessionToken=abc' },
    breadcrumbs: [
      { category: 'http', data: { url: `https://maps.googleapis.com/maps/api/geocode/json?latlng=10.3312345,123.9046789&language=en&key=${FAKE_KEY}` } },
      { category: 'http', data: { 'http.query': `latlng=10.3312345,123.9046789&key=${FAKE_KEY}` } },
      { category: 'http', data: { url: '/api/v1/geo/reverse?lat=10.3312345&lng=123.9046789' } },
    ],
    tags: { route: 'geo' },
  };
  const sent = options.beforeSend(errorEvent, {});

  expect(sent).toBe(errorEvent);
  const text = JSON.stringify(sent);
  for (const secret of [FAKE_KEY, '10.3312345', '123.9046789', 'ChIJcebuCityGorordo0001']) {
    expect(text).not.toContain(secret);
  }
  expect(sent).toEqual({
    level: 'error',
    request: { method: 'GET', url: 'https://api.onservice.ph/api/v1/geo/place/[redacted]?[redacted]' },
    breadcrumbs: [
      { category: 'http', data: { url: 'https://maps.googleapis.com/maps/api/geocode/json?latlng=[redacted]&language=en&key=[redacted]' } },
      { category: 'http', data: { 'http.query': 'latlng=[redacted]&key=[redacted]' } },
      { category: 'http', data: { url: '/api/v1/geo/reverse?[redacted]' } },
    ],
    tags: { route: 'geo' },
  });
}, 30_000);
