// HA-M2 (D38 Milestone 2, package P3 review fixes) helper: import the real
// server.ts the way server-health-smoke.test.ts does, with the production
// listener suppressed and the process handlers it registers removed again,
// so a test can drive the real app (its request log, rate limiter and
// routes) or read the options it gave Sentry. The calling test file must
// mock dotenv, @sentry/node, the logger, socket.service, jobs/workers and
// jobs/queue itself (jest.mock is hoisted per file).
import { Server } from 'node:http';
import type { Express } from 'express';

const HANDLED_EVENTS = ['SIGTERM', 'SIGINT', 'unhandledRejection', 'uncaughtException'] as const;

/**
 * With runListenCallback the suppressed listen still runs its callback (the
 * start-up tasks: private folders, limiter refresh loops, drift check), as a
 * real start would; without it, nothing in the callback runs.
 */
export async function importServerForTest(
  env: Record<string, string | undefined>,
  options: { runListenCallback?: boolean } = {},
): Promise<Express> {
  const priorListeners = new Map(HANDLED_EVENTS.map(event => [event, new Set(process.listeners(event))]));
  const keys = ['NODE_ENV', 'ALLOW_DEV_OTP', 'ENABLE_TEST_FIXTURES', 'SENTRY_DSN', 'SENTRY_API_DSN', ...Object.keys(env)];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const settings: Record<string, string | undefined> = {
    NODE_ENV: 'test', ALLOW_DEV_OTP: '0', ENABLE_TEST_FIXTURES: '0', SENTRY_DSN: undefined, SENTRY_API_DSN: undefined, ...env,
  };
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const listen = jest.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server, ...args: unknown[]) {
    const callback = args.find((arg): arg is () => void => typeof arg === 'function');
    if (options.runListenCallback && callback) callback();
    return this;
  });
  try {
    return (await import('../../src/server')).default;
  } finally {
    listen.mockRestore();
    for (const event of HANDLED_EVENTS) {
      for (const listener of process.listeners(event)) {
        if (!priorListeners.get(event)!.has(listener)) process.removeListener(event, listener);
      }
    }
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}
