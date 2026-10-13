// HA-M2-10 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// getJobMediaLimits() returns the stored media limits while they are inside
// the admin bounds of migration 184 (zero photos is allowed) and falls back to
// the seeded default for any value outside them: one step below every
// minimum, one step above every maximum, and a value that is not a number.
// The photo ceiling is 6 (6 photos + 1 video + 1 voice note = the 8 mediaIds
// a job request accepts). Real platform_settings rows seeded by migration 184
// on the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { getJobMediaLimits } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const DEFAULT_LIMITS = {
  maxPhotos: 6, photoMaxBytes: 10485760, videoMaxSeconds: 30,
  videoMaxBytes: 83886080, voiceMaxSeconds: 60, voiceMaxBytes: 2097152,
};

async function storeLimits(database: Pool, values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const updated = await database.query('UPDATE platform_settings SET value = $2 WHERE key = $1', [key, value]);
    expect(updated.rowCount).toBe(1);
  }
}

it('HA-M2-10: getJobMediaLimits keeps values inside the migration bounds and replaces values outside them with the defaults', async () => {
  await withRequestEngineDatabase(async database => {
    expect(await getJobMediaLimits()).toEqual(DEFAULT_LIMITS);

    // The lower edge of every range, including zero photos.
    await storeLimits(database, {
      job_media_max_photos: '0', job_media_photo_max_bytes: '1048576', job_media_video_max_seconds: '5',
      job_media_video_max_bytes: '10485760', job_media_voice_max_seconds: '10', job_media_voice_max_bytes: '262144',
    });
    expect(await getJobMediaLimits()).toEqual({
      maxPhotos: 0, photoMaxBytes: 1048576, videoMaxSeconds: 5,
      videoMaxBytes: 10485760, voiceMaxSeconds: 10, voiceMaxBytes: 262144,
    });

    // The upper edge of every range. Neither edge is a default, so a value
    // that reached the fallback instead would fail here.
    await storeLimits(database, {
      job_media_max_photos: '5', job_media_photo_max_bytes: '15728640', job_media_video_max_seconds: '60',
      job_media_video_max_bytes: '157286400', job_media_voice_max_seconds: '120', job_media_voice_max_bytes: '10485760',
    });
    expect(await getJobMediaLimits()).toEqual({
      maxPhotos: 5, photoMaxBytes: 15728640, videoMaxSeconds: 60,
      videoMaxBytes: 157286400, voiceMaxSeconds: 120, voiceMaxBytes: 10485760,
    });
    await storeLimits(database, { job_media_max_photos: '6' });
    expect((await getJobMediaLimits()).maxPhotos).toBe(6);

    // One step below every minimum.
    await storeLimits(database, {
      job_media_max_photos: '-1', job_media_photo_max_bytes: '1048575', job_media_video_max_seconds: '4',
      job_media_video_max_bytes: '10485759', job_media_voice_max_seconds: '9', job_media_voice_max_bytes: '262143',
    });
    expect(await getJobMediaLimits()).toEqual(DEFAULT_LIMITS);

    // One step above every maximum. Seven photos would make 9 items with a
    // video and a voice note, more than a job request accepts.
    await storeLimits(database, {
      job_media_max_photos: '7', job_media_photo_max_bytes: '15728641', job_media_video_max_seconds: '61',
      job_media_video_max_bytes: '157286401', job_media_voice_max_seconds: '121', job_media_voice_max_bytes: '10485761',
    });
    expect(await getJobMediaLimits()).toEqual(DEFAULT_LIMITS);

    // Values that are not numbers.
    await storeLimits(database, {
      job_media_max_photos: 'six', job_media_photo_max_bytes: 'max', job_media_video_max_seconds: 'long',
      job_media_video_max_bytes: 'big', job_media_voice_max_seconds: 'NaN', job_media_voice_max_bytes: 'big',
    });
    expect(await getJobMediaLimits()).toEqual(DEFAULT_LIMITS);
  });
}, 90000);
