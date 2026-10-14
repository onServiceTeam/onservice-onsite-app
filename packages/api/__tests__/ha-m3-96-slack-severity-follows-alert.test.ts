// HA-M3-96 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): the Slack message's severity follows
// the alert: an amber wait is posted as a warning and a red wait as an error,
// which sets the message's marker (slack-alert.service). One sweep raises an
// amber alert (6 minutes) and a red one (12 minutes). The real sweep and the
// real slack-alert service run; only globalThis.fetch is replaced by a
// recorder for the synthetic webhook. Real SQL on the guarded PostgreSQL
// fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const WEBHOOK = 'https://hooks.slack.test/services/synthetic-marketplace-alerts';

it('HA-M3-96: Slack posts an amber alert as a warning and a red alert as an error', async () => {
  await withMarketplaceDatabase(async database => {
    const amber = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    const red = await insertQuoteRequest(database, { roundOpenedAgo: '12 minutes' });
    const fixtureGuard = globalThis.fetch;
    const bodies: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== WEBHOOK) throw new Error(`Unexpected network call to ${String(url)}`);
      bodies.push(String(init?.body));
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const savedWebhook = process.env.SLACK_ALERT_WEBHOOK_URL;
    process.env.SLACK_ALERT_WEBHOOK_URL = WEBHOOK;
    try {
      expect(await sweepMarketplaceAlerts()).toEqual({ raised: 2, resolved: 0 });
    } finally {
      globalThis.fetch = fixtureGuard;
      if (savedWebhook === undefined) delete process.env.SLACK_ALERT_WEBHOOK_URL;
      else process.env.SLACK_ALERT_WEBHOOK_URL = savedWebhook;
    }

    const headerFor = (bookingId: string) => {
      const body = bodies.find(text => text.includes(bookingId));
      expect(body).toBeDefined();
      return (JSON.parse(body!) as { blocks: Array<{ type: string; text?: { text: string } }> })
        .blocks.find(block => block.type === 'header')!.text!.text;
    };
    expect(bodies).toHaveLength(2);
    expect(headerFor(amber)).toBe(':warning: Quote request waiting 5+ min with no quote');
    expect(headerFor(red)).toBe(':rotating_light: Quote request waiting 10+ min with no quote (red)');
  });
}, 90000);
