// HA-M3-20 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API):
// Slack is posted exactly when the server has SLACK_ALERT_WEBHOOK_URL, once
// per new alert. With the variable unset a sweep that raises an alert sends
// nothing over the network. With it set, a sweep that raises two new alerts
// posts two messages to that webhook, the alert raised earlier is not posted
// again, and a repeat sweep posts nothing. The real sweep and the real
// slack-alert service run; only the network call itself (globalThis.fetch) is
// replaced by a recorder that accepts the synthetic webhook and nothing else.
// Real SQL on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const WEBHOOK = 'https://hooks.slack.test/services/synthetic-marketplace-alerts';

it('HA-M3-20: Slack is called once per new alert when configured and not at all otherwise', async () => {
  await withMarketplaceDatabase(async database => {
    const fixtureGuard = globalThis.fetch;
    const posted: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== WEBHOOK) throw new Error(`Unexpected network call to ${String(url)}`);
      posted.push({ url: String(url), body: String(init?.body) });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const savedWebhook = process.env.SLACK_ALERT_WEBHOOK_URL;
    try {
      delete process.env.SLACK_ALERT_WEBHOOK_URL;
      await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
      expect(await sweepMarketplaceAlerts()).toMatchObject({ raised: 1 });
      expect(posted).toEqual([]);

      process.env.SLACK_ALERT_WEBHOOK_URL = WEBHOOK;
      const amber = await insertQuoteRequest(database, { roundOpenedAgo: '7 minutes' });
      const red = await insertQuoteRequest(database, { roundOpenedAgo: '12 minutes' });
      expect(await sweepMarketplaceAlerts()).toMatchObject({ raised: 2 });
      expect(posted).toHaveLength(2);
      const postedBookings = posted.map(post => [amber, red].find(id => post.body.includes(id)));
      expect(postedBookings.sort()).toEqual([amber, red].sort());

      expect(await sweepMarketplaceAlerts()).toMatchObject({ raised: 0 });
      expect(posted).toHaveLength(2);
    } finally {
      globalThis.fetch = fixtureGuard;
      if (savedWebhook === undefined) delete process.env.SLACK_ALERT_WEBHOOK_URL;
      else process.env.SLACK_ALERT_WEBHOOK_URL = savedWebhook;
    }
  });
}, 90000);
