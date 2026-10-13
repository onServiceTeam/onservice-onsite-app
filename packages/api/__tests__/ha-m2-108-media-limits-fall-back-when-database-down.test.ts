// HA-M2-108 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 33): when the settings database cannot be reached (and the
// Redis cache is empty) the six job-media limits resolve to the migration
// 184 defaults instead of failing, so uploads keep their safe limits during
// an outage. The shared test setup makes every PostgreSQL call reject, which
// is exactly the outage; the real settings service runs unmocked. (Bounds
// are HA-M2-10; the client-config bulk read is HA-M2-11.)
import { pool } from '../src/config/database.config';
import { getJobMediaLimits } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-108: the six media limits fall back to their defaults when the settings database is unreachable', async () => {
  await expect(pool.query('SELECT 1')).rejects.toThrow(/unmocked PostgreSQL/);
  const limits = await getJobMediaLimits();
  expect(limits).toEqual({
    maxPhotos: 6,
    photoMaxBytes: 10485760,
    videoMaxSeconds: 30,
    videoMaxBytes: 83886080,
    voiceMaxSeconds: 60,
    voiceMaxBytes: 2097152,
  });
  // Every limit was looked up in the database first (and failed).
  const keys = (pool.query as jest.Mock).mock.calls.map(call => call[1]?.[0]).filter(Boolean).sort();
  expect(keys).toEqual([
    'job_media_max_photos', 'job_media_photo_max_bytes', 'job_media_video_max_bytes',
    'job_media_video_max_seconds', 'job_media_voice_max_bytes', 'job_media_voice_max_seconds',
  ]);
});
