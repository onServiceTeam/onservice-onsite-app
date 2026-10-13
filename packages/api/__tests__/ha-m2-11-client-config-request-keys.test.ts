// HA-M2-11 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// the public client config (GET /api/v1/config) gives the apps the request
// settings and the job-media limits, read in the same single bulk settings
// query as every other config value (MED-N107), and still carries the
// retired maxQuotesPerBooking for apps older than 1.0.4. Real platform_settings
// rows from migrations 183 and 184 on the guarded PostgreSQL fixture; the
// query count is observed on the real pool, not mocked.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { upsertPlatformSetting, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { pool } from '../src/config/database.config';
import { getClientConfig } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const OPERATOR_VALUES: Record<string, string> = {
  request_max_open_quotes: '3',
  request_max_rounds: '5',
  request_show_declined_amount: 'true',
  request_provider_poll_seconds: '45',
  request_customer_still_looking_minutes: '20',
  job_media_max_photos: '4',
  job_media_photo_max_bytes: '5242880',
  job_media_video_max_seconds: '20',
  job_media_video_max_bytes: '52428800',
  job_media_voice_max_seconds: '45',
  job_media_voice_max_bytes: '1048576',
};

it('HA-M2-11: getClientConfig returns the request keys and jobMedia limits from its one bulk settings query', async () => {
  await withRequestEngineDatabase(async database => {
    for (const [key, value] of Object.entries(OPERATOR_VALUES)) {
      const updated = await database.query('UPDATE platform_settings SET value = $2 WHERE key = $1', [key, value]);
      expect(updated.rowCount).toBe(1);
    }
    await upsertPlatformSetting(database, 'request_threads_enabled', 'false');

    const statements: string[] = [];
    const realQuery = pool.query;
    pool.query = ((text: string, params?: unknown[]) => {
      statements.push(text);
      return (realQuery as (t: string, p?: unknown[]) => Promise<unknown>)(text, params);
    }) as typeof pool.query;
    let config: Record<string, unknown>;
    try {
      config = await getClientConfig();
    } finally {
      pool.query = realQuery;
    }

    // Feature flags, then the one bulk SELECT that now also carries the D38 keys.
    expect(statements).toHaveLength(2);
    expect(statements[1]).toContain('key = ANY($1::text[])');
    expect(config).toMatchObject({
      requestMaxOpenQuotes: 3,
      requestMaxRounds: 5,
      requestShowDeclinedAmount: true,
      requestProviderPollSeconds: 45,
      requestStillLookingMinutes: 20,
      requestThreadsEnabled: false,
      jobMedia: {
        maxPhotos: 4, photoMaxBytes: 5242880, videoMaxSeconds: 20,
        videoMaxBytes: 52428800, voiceMaxSeconds: 45, voiceMaxBytes: 1048576,
      },
      maxQuotesPerBooking: 5,
      requestFirstBooking: true,
    });
  });
}, 90000);
