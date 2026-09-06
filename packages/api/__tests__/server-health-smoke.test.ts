/**
 * Real server.ts mounting and HTTP handlers, not a recreation of /health.
 * DB/Redis and background services are mocked; the production listener and
 * startup callback are suppressed during import. Supertest subsequently uses
 * real ephemeral HTTP servers. This is not a deployed dependency/boot check.
 */
import { Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';

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

import { pool } from '../src/config/database.config';
import { redis } from '../src/config/redis.config';
import { platformConfig } from '../src/config/platform.config';

let app: Express;

beforeAll(async () => {
  const events = ['SIGTERM', 'SIGINT', 'unhandledRejection', 'uncaughtException'] as const;
  const priorListeners = new Map(events.map((event) => [event, new Set(process.listeners(event))]));
  const envKeys = ['NODE_ENV', 'ALLOW_DEV_OTP', 'ENABLE_TEST_FIXTURES', 'SENTRY_DSN', 'SENTRY_API_DSN'] as const;
  const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DEV_OTP = '0';
  process.env.ENABLE_TEST_FIXTURES = '0';
  delete process.env.SENTRY_DSN;
  delete process.env.SENTRY_API_DSN;
  const listen = jest.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    return this;
  });
  try {
    app = (await import('../src/server')).default;
  } finally {
    listen.mockRestore();
    // Remove only the handlers registered by this import, never Jest's own.
    for (const event of events) {
      for (const listener of process.listeners(event)) {
        if (!priorListeners.get(event)!.has(listener)) process.removeListener(event, listener);
      }
    }
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }
}, 30_000);

beforeEach(() => {
  jest.mocked(pool.query).mockReset().mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 } as never);
  jest.mocked(redis.ping).mockReset().mockResolvedValue('PONG');
});

it('GET /health returns liveness without checking PostgreSQL or Redis', async () => {
  const startedAt = Date.now();
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.body).toEqual({ status: 'ok', version: platformConfig.appVersion, timestamp: expect.any(String) });
  expect(Date.parse(response.body.timestamp)).toBeGreaterThanOrEqual(startedAt);
  expect(Date.parse(response.body.timestamp)).toBeLessThanOrEqual(Date.now());
  expect(pool.query).not.toHaveBeenCalled();
  expect(redis.ping).not.toHaveBeenCalled();
});

it.each([
  { postgresFails: false, redisFails: false, status: 200, state: 'ready' },
  { postgresFails: true, redisFails: false, status: 503, state: 'degraded' },
  { postgresFails: false, redisFails: true, status: 503, state: 'degraded' },
  { postgresFails: true, redisFails: true, status: 503, state: 'degraded' },
])('GET /health/ready reports PostgreSQL failure=$postgresFails Redis failure=$redisFails', async (fixture) => {
  if (fixture.postgresFails) jest.mocked(pool.query).mockRejectedValueOnce(new Error('synthetic-private-db-detail'));
  if (fixture.redisFails) jest.mocked(redis.ping).mockRejectedValueOnce(new Error('synthetic-private-redis-detail'));
  const startedAt = Date.now();
  const response = await request(app).get('/health/ready');
  expect(response.status).toBe(fixture.status);
  expect(response.body).toEqual({
    status: fixture.state, version: platformConfig.appVersion, timestamp: expect.any(String),
    checks: { postgres: fixture.postgresFails ? 'error' : 'ok', redis: fixture.redisFails ? 'error' : 'ok' },
  });
  expect(Date.parse(response.body.timestamp)).toBeGreaterThanOrEqual(startedAt);
  expect(Date.parse(response.body.timestamp)).toBeLessThanOrEqual(Date.now());
  expect(pool.query).toHaveBeenCalledTimes(1);
  expect(redis.ping).toHaveBeenCalledTimes(1);
  expect(response.text).not.toContain('synthetic-private');
});
