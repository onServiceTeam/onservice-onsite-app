// HA-M2-94 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 15): a signed media link is checked before any database
// work. A tampered signature gets 403, an expired link gets 410, and a
// project-document signature for the same id (same export secret, different
// purpose) does not verify as a media link (403). Real router and signing
// code over HTTP; the shared test setup rejects every database call, so a
// lookup before the signature check would surface as a 500.
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jobMediaRouter from '../src/routes/job-media.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { signMediaToken } from '../src/services/job-media.service';
import { pool } from '../src/config/database.config';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const SECRET = 'ha-m2-94-synthetic-export-secret-0123456789abcdef';
const mediaId = '94000000-0000-4000-8000-000000000001';
const viewerId = '94000000-0000-4000-8000-000000000002';

function app(): express.Express {
  const server = express();
  server.use('/api/v1/job-media', jobMediaRouter);
  server.use(errorMiddleware);
  return server;
}

it('HA-M2-94: a tampered signature gets 403, an expired link 410, and a project-document signature is not a media link', async () => {
  const saved = process.env.DATA_EXPORT_DOWNLOAD_SECRET;
  process.env.DATA_EXPORT_DOWNLOAD_SECRET = SECRET;
  try {
    const now = Math.floor(Date.now() / 1000);
    const valid = signMediaToken(mediaId, viewerId, now + 600);
    const lastHex = valid.slice(-1);
    const tampered = `${valid.slice(0, -1)}${lastHex === '0' ? '1' : '0'}`;
    const tamperedResponse = await request(app()).get(`/api/v1/job-media/file/${tampered}`);
    expect(tamperedResponse.status).toBe(403);
    expect(tamperedResponse.body.error.code).toBe('forbidden');

    // Changing whose link it is also breaks the signature.
    const [, , exp, sig] = valid.split('.');
    const otherViewer = `${mediaId}.94000000-0000-4000-8000-000000000003.${exp}.${sig}`;
    expect((await request(app()).get(`/api/v1/job-media/file/${otherViewer}`)).status).toBe(403);

    const expired = signMediaToken(mediaId, viewerId, now - 5);
    const expiredResponse = await request(app()).get(`/api/v1/job-media/file/${expired}`);
    expect(expiredResponse.status).toBe(410);
    expect(expiredResponse.body.error.code).toBe('link_expired');

    // A link claiming to live longer than the 10-minute lifetime was not minted here.
    const tooLong = signMediaToken(mediaId, viewerId, now + 3600);
    expect((await request(app()).get(`/api/v1/job-media/file/${tooLong}`)).status).toBe(403);

    // The project-document download signature (project.service.ts) over the same id and expiry.
    const projectSig = crypto.createHmac('sha256', SECRET).update(`project-document:${mediaId}:${now + 600}`).digest('hex');
    const crossPurpose = await request(app()).get(`/api/v1/job-media/file/${mediaId}.${viewerId}.${now + 600}.${projectSig}`);
    expect(crossPurpose.status).toBe(403);

    // None of these reached the database.
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  } finally {
    if (saved === undefined) delete process.env.DATA_EXPORT_DOWNLOAD_SECRET;
    else process.env.DATA_EXPORT_DOWNLOAD_SECRET = saved;
  }
});
