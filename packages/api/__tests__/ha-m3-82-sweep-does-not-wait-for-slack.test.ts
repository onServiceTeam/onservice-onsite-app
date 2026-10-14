// HA-M3-82 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): the alert sweep never waits for Slack.
// It runs in the one shared scheduler worker (concurrency 1) beside the
// engine's 5-minute job (quote expiry, reopen, 72-hour expiry), and the Slack
// webhook post has no timeout, so a webhook that hangs must not hold that
// worker. Here SLACK_ALERT_WEBHOOK_URL is set and the network call never
// answers: a sweep that raises two alerts still returns within 3 seconds with
// its counts, and both Slack posts were started. The real sweep and the real
// slack-alert service run; only globalThis.fetch is replaced. Real SQL on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const WEBHOOK = 'https://hooks.slack.test/services/synthetic-marketplace-alerts';

it('HA-M3-82: the sweep returns while the Slack webhook never answers', async () => {
  await withMarketplaceDatabase(async database => {
    await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await insertQuoteRequest(database, { roundOpenedAgo: '12 minutes' });
    const fixtureGuard = globalThis.fetch;
    const started: string[] = [];
    globalThis.fetch = ((url: string | URL | Request) => {
      if (String(url) !== WEBHOOK) throw new Error(`Unexpected network call to ${String(url)}`);
      started.push(String(url));
      return new Promise<Response>(() => { /* the webhook never answers */ });
    }) as typeof fetch;
    const savedWebhook = process.env.SLACK_ALERT_WEBHOOK_URL;
    process.env.SLACK_ALERT_WEBHOOK_URL = WEBHOOK;
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        sweepMarketplaceAlerts(),
        new Promise<'still waiting on Slack'>(resolve => { timer = setTimeout(() => resolve('still waiting on Slack'), 3000); }),
      ]);

      expect(outcome).toEqual({ raised: 2, resolved: 0 });
      expect(started).toEqual([WEBHOOK, WEBHOOK]);
    } finally {
      if (timer) clearTimeout(timer);
      globalThis.fetch = fixtureGuard;
      if (savedWebhook === undefined) delete process.env.SLACK_ALERT_WEBHOOK_URL;
      else process.env.SLACK_ALERT_WEBHOOK_URL = savedWebhook;
    }
  });
}, 90000);
