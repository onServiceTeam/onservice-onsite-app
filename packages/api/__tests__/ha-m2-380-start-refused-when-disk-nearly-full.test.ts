// HA-M2-380 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): new uploads are paused
// when the uploads volume has less than 5 GiB free (design-media.md
// section 6 disk guard): the start gets 507 job_media_storage_full, no row
// is written and the refusal is logged as an error. With exactly 5 GiB free
// the same start is accepted. Real router, validation, auth, service and
// migration 184 on the guarded PostgreSQL fixture; only the free-space
// reading of the volume is stubbed.
import crypto from 'node:crypto';
import * as uploadService from '../src/services/upload.service';
import { logger } from '../src/utils/logger';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const FIVE_GIB = 5 * 1024 * 1024 * 1024;

it('HA-M2-380: start gets 507 job_media_storage_full with under 5 GiB free on the uploads volume', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const start = () => customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: 1000, clientUploadId: crypto.randomUUID() });
    const free = jest.spyOn(uploadService, 'getUploadVolumeFreeBytes');
    try {
      free.mockResolvedValue(FIVE_GIB - 1);
      const refused = await start();
      expect(refused.status).toBe(507);
      expect(refused.body.error.code).toBe('job_media_storage_full');
      expect((await database.query('SELECT count(*)::int AS n FROM job_media')).rows[0].n).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Job media upload refused: the uploads volume is nearly full', { freeBytes: FIVE_GIB - 1 },
      );

      free.mockResolvedValue(FIVE_GIB);
      expect((await start()).status).toBe(201);
    } finally {
      free.mockRestore();
    }
  });
}, 60000);
