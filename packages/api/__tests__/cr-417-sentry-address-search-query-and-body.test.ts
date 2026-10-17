// CR-417 (D24 Option A, 2026-10-18 review): Sentry v9 puts the incoming
// request on an error event in its own fields: request.url, request.query_string
// (for example "q=123%20Gorordo%20Avenue&sessionToken=...") and request.data
// (the JSON body, which is where the address search details now travel).
// The real server.ts beforeSend hook replaces query_string and data whole for
// an address search request, whatever the letter case of the path (Express
// routes /API/V1/GEO/... to the same router), and also redacts the place ID
// in an outgoing Place Details URL and any sessionToken= value in a
// breadcrumb. Another route's query string and body are left as they are.
// The hooks run for real; @sentry/node is mocked only to capture them.
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
const TOKEN = '6f1c2a4e-8b3d-4c5e-9f70-112233445566';
const PLACE_ID = 'ChIJcebuCityGorordo0001';

it('Bug CR-417 — Sentry error events about address search keep no query string, body, place ID or session token, in any letter case', async () => {
  await importServerForTest({ SENTRY_DSN: 'https://public@example.invalid/1' });
  const options = jest.mocked(Sentry.init).mock.calls[0]![0] as { beforeSend: Hook };

  const events = [
    {
      request: {
        method: 'POST', url: 'https://api.onservice.ph/api/v1/geo/autocomplete',
        data: { q: '123 Gorordo Avenue', sessionToken: TOKEN, lat: 10.3312345, lng: 123.9046789 },
      },
    },
    {
      request: {
        method: 'GET', url: 'https://api.onservice.ph/API/V1/GEO/Reverse?lat=10.3312345&lng=123.9046789',
        query_string: 'lat=10.3312345&lng=123.9046789',
      },
    },
    {
      transaction: 'POST /api/v1/geo/place',
      request: { method: 'POST', url: 'http://localhost/x', data: JSON.stringify({ placeId: PLACE_ID, sessionToken: TOKEN }) },
      breadcrumbs: [
        { category: 'http', data: { url: `https://places.googleapis.com/v1/places/${PLACE_ID}?sessionToken=${TOKEN}&languageCode=en` } },
      ],
    },
  ];

  for (const event of events) {
    const sent = options.beforeSend(event, {});
    const text = JSON.stringify(sent);
    for (const secret of ['Gorordo', '10.3312345', '123.9046789', TOKEN, PLACE_ID]) {
      expect({ secret, found: text.includes(secret) }).toEqual({ secret, found: false });
    }
  }
  expect((events[0]!.request as Record<string, unknown>).data).toBe('[redacted]');
  expect((events[1]!.request as Record<string, unknown>).query_string).toBe('[redacted]');
  expect((events[1]!.request as Record<string, unknown>).url).toBe('https://api.onservice.ph/api/v1/geo/reverse?[redacted]');
  expect(events[2]!.breadcrumbs![0]!.data.url).toBe(
    'https://places.googleapis.com/v1/places/[redacted]?sessionToken=[redacted]&languageCode=en',
  );

  // Another route keeps its query string and body.
  const other = {
    request: { method: 'POST', url: 'https://api.onservice.ph/api/v1/addresses', query_string: 'label=Home', data: { label: 'Home' } },
  };
  expect(options.beforeSend(other, {})).toEqual({
    request: { method: 'POST', url: 'https://api.onservice.ph/api/v1/addresses', query_string: 'label=Home', data: { label: 'Home' } },
  });
}, 30_000);
