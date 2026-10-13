// HA-M2-09 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// getRequestPolicy() returns the stored request-engine values while they are
// inside the admin bounds, falls back to the seeded default for any value
// outside them (one step below every minimum, one step above every maximum,
// and a value that is not a number), and returns the defaults when the
// settings read fails. Real platform_settings rows seeded by migrations 183
// and 184 on the guarded PostgreSQL fixture; the failed read is a real
// Postgres error.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { upsertPlatformSetting, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { getRequestPolicy } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const DEFAULT_POLICY = {
  maxOpenQuotes: 1, maxRounds: 3, maxInvites: 30, showDeclinedAmount: false,
  providerPollSeconds: 30, stillLookingMinutes: 30, slotLeadMinutes: 60, threadsEnabled: true,
};

async function storePolicy(database: Pool, values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const updated = await database.query('UPDATE platform_settings SET value = $2 WHERE key = $1', [key, value]);
    expect(updated.rowCount).toBe(1);
  }
}

it('HA-M2-09: getRequestPolicy keeps in-range values, bounds out-of-range values to the defaults, and falls back when the database read fails', async () => {
  await withRequestEngineDatabase(async database => {
    // Seeded rows only (request_threads_enabled arrives with 185): defaults.
    expect(await getRequestPolicy()).toEqual(DEFAULT_POLICY);
    await upsertPlatformSetting(database, 'request_threads_enabled', 'true');

    // In-range operator values pass through: the lower edge of every range.
    await storePolicy(database, {
      request_max_open_quotes: '1', request_max_rounds: '1', request_max_invites: '1',
      request_show_declined_amount: 'true', request_provider_poll_seconds: '15',
      request_customer_still_looking_minutes: '10', request_slot_lead_minutes: '15',
      request_threads_enabled: 'false',
    });
    expect(await getRequestPolicy()).toEqual({
      maxOpenQuotes: 1, maxRounds: 1, maxInvites: 1, showDeclinedAmount: true,
      providerPollSeconds: 15, stillLookingMinutes: 10, slotLeadMinutes: 15, threadsEnabled: false,
    });

    // The upper edge of every range.
    await storePolicy(database, {
      request_max_open_quotes: '20', request_max_rounds: '10', request_max_invites: '200',
      request_provider_poll_seconds: '120', request_customer_still_looking_minutes: '240',
      request_slot_lead_minutes: '240',
    });
    expect(await getRequestPolicy()).toEqual({
      maxOpenQuotes: 20, maxRounds: 10, maxInvites: 200, showDeclinedAmount: true,
      providerPollSeconds: 120, stillLookingMinutes: 240, slotLeadMinutes: 240, threadsEnabled: false,
    });

    // One step below every minimum (booleans: a value that is not 'true'/'1'
    // reads as false; threads goes back on so the default shape is whole).
    await storePolicy(database, {
      request_max_open_quotes: '0', request_max_rounds: '0', request_max_invites: '0',
      request_show_declined_amount: 'yes', request_provider_poll_seconds: '14',
      request_customer_still_looking_minutes: '9', request_slot_lead_minutes: '14',
      request_threads_enabled: 'true',
    });
    expect(await getRequestPolicy()).toEqual(DEFAULT_POLICY);

    // One step above every maximum.
    await storePolicy(database, {
      request_max_open_quotes: '21', request_max_rounds: '11', request_max_invites: '201',
      request_provider_poll_seconds: '121', request_customer_still_looking_minutes: '241',
      request_slot_lead_minutes: '241',
    });
    expect(await getRequestPolicy()).toEqual(DEFAULT_POLICY);

    // Values that are not numbers.
    await storePolicy(database, {
      request_max_open_quotes: 'one', request_max_rounds: 'three', request_max_invites: 'many',
      request_provider_poll_seconds: 'often', request_customer_still_looking_minutes: 'soon',
      request_slot_lead_minutes: 'NaN',
    });
    expect(await getRequestPolicy()).toEqual(DEFAULT_POLICY);

    // A failed settings read (here a real "relation does not exist" error)
    // falls back to SETTING_DEFAULTS instead of throwing.
    await storePolicy(database, { request_max_open_quotes: '7' });
    expect((await getRequestPolicy()).maxOpenQuotes).toBe(7);
    await database.query('ALTER TABLE platform_settings RENAME TO platform_settings_offline');
    try {
      expect(await getRequestPolicy()).toEqual(DEFAULT_POLICY);
    } finally {
      await database.query('ALTER TABLE platform_settings_offline RENAME TO platform_settings');
    }
  });
}, 90000);
