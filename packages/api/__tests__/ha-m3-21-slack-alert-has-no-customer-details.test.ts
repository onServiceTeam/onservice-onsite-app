// HA-M3-21 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 85): the Slack message for a request alert carries the
// service, the city, the wait, the round, the provider counts and the booking
// id, and nothing that identifies the customer: no name, phone, email, street
// address or job description. The real sweep and slack-alert service run;
// only globalThis.fetch is replaced by a recorder for the synthetic webhook.
// Real SQL on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { customerA, insertQuoteRequest } from './helpers/request-flow-postgres';
import { withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const WEBHOOK = 'https://hooks.slack.test/services/synthetic-marketplace-alerts';

it('HA-M3-21: the Slack alert names the service and city but no customer details', async () => {
  await withMarketplaceDatabase(async database => {
    await database.query(`UPDATE users SET phone = '+639175550101', email = 'ana.reyes@example.test' WHERE id = $1`, [customerA]);
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '12 minutes' });
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
      await sweepMarketplaceAlerts();
    } finally {
      globalThis.fetch = fixtureGuard;
      if (savedWebhook === undefined) delete process.env.SLACK_ALERT_WEBHOOK_URL;
      else process.env.SLACK_ALERT_WEBHOOK_URL = savedWebhook;
    }

    expect(bodies).toHaveLength(1);
    const text = JSON.stringify(JSON.parse(bodies[0]!));
    for (const expected of ['Aircon repair', 'Cebu City', '12 min', bookingId]) expect(text).toContain(expected);
    for (const forbidden of ['Ana', 'Reyes', '9175550101', '0101', 'ana.reyes', 'Mango Avenue', 'Kamputhaw', 'drips water']) {
      expect(text).not.toContain(forbidden);
    }
  });
}, 90000);
