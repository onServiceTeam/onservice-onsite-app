// HA-M2-374 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): when moving a checked
// voice note into private storage fails part way (the file was already
// renamed into the store, then setting its permissions failed), completing
// it answers with an error, the stored copy is removed, and the row goes
// back to 'uploading' with its storage key recorded so the app can try
// again. The retry is then refused (the temp file is gone) and the row
// becomes rejected, with no file left in the owner's store folder: nothing
// private is left behind with no clean-up path. Real router, auth, service,
// storage on a throwaway uploads volume and migration 184 on the guarded
// PostgreSQL fixture; only the one store call is made to fail after it moved
// the file.
import fs from 'node:fs';
import path from 'node:path';
import * as uploadService from '../src/services/upload.service';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-374: a store move that fails after renaming the file leaves no stored file behind', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const realSave = uploadService.savePrivateArtifactFromFile;
    const save = jest.spyOn(uploadService, 'savePrivateArtifactFromFile')
      .mockImplementationOnce(async (tempPath: string, objectKey: string, contentType: string) => {
        await realSave(tempPath, objectKey, contentType); // the file is renamed into the store...
        throw new Error('synthetic chmod failure'); // ...then the step fails
      });
    const ownerFolder = path.join(uploadDir, 'private-artifacts', 'job-media', customerA);
    const filesInStore = () => (fs.existsSync(ownerFolder) ? fs.readdirSync(ownerFolder) : []);

    let first: Awaited<ReturnType<typeof uploadThroughApi>>;
    try {
      first = await uploadThroughApi(customer, {
        kind: 'voice', mime: 'audio/mp4', durationMs: 9000,
        bytes: buildMp4({ brand: 'M4A ', durationMs: 9000, tracks: [{ handler: 'soun', codec: 'mp4a' }] }),
      });
    } finally {
      save.mockRestore();
    }
    expect(first.completed.status).toBe(500);
    expect(filesInStore()).toEqual([]);
    expect((await database.query('SELECT status, storage_key FROM job_media WHERE id = $1', [first.id])).rows)
      .toEqual([{ status: 'uploading', storage_key: `private-artifacts/job-media/${customerA}/${first.id}.m4a` }]);

    const retry = await customer.complete(first.id);
    expect(retry.status).toBe(400);
    expect(retry.body.error.code).toBe('malformed');
    expect((await database.query('SELECT status FROM job_media WHERE id = $1', [first.id])).rows).toEqual([{ status: 'rejected' }]);
    expect(filesInStore()).toEqual([]);
  });
}, 60000);
