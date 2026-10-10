import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import providerRouter from '../src/routes/provider.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { draftIntegrationIt as it, withDraftDatabase, draftOwner, otherDraftOwner } from './helpers/provider-draft-postgres';

it('Bug OPS-489 — the mounted draft HTTP routes authenticate the canonical owner, never cache private fields, and retain safe conflict responses', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'application-draft-fixture-secret-not-a-real-credential';
  const app = express();
  app.use(express.json());
  app.use('/api/v1/providers', providerRouter);
  app.use(errorMiddleware);
  const endpoint = '/api/v1/providers/application-draft';
  const token = (userId: string, role = 'customer', sessionVersion = 1) => jwt.sign(
    { userId, role, sessionVersion, type: 'access' }, process.env.JWT_SECRET!, { expiresIn: '5m' },
  );
  try {
    await withDraftDatabase(async database => {
      for (const method of ['get', 'put', 'delete'] as const) {
        const unauthenticated = await request(app)[method](endpoint).send({});
        expect(unauthenticated.status).toBe(401);
        expect(unauthenticated.headers['cache-control']).toBe('private, no-store');
      }
      const ownerToken = token(draftOwner);
      const fresh = await request(app).get(endpoint).auth(ownerToken, { type: 'bearer' });
      expect(fresh.status).toBe(200);
      expect(fresh.body).toEqual({ success: true, data: null });
      const saved = await request(app).put(endpoint).auth(ownerToken, { type: 'bearer' })
        .send({ expectedRevision: null, fields: { businessName: 'Private applicant', governmentIdNumber: 'FIXTURE-ID' } });
      expect(saved.status).toBe(200);
      expect(saved.headers['cache-control']).toBe('private, no-store');
      expect(saved.body.data.fields).toMatchObject({ businessName: 'Private applicant', governmentIdNumber: 'FIXTURE-ID' });
      const revision: string = saved.body.data.revision;
      const loaded = await request(app).get(endpoint).auth(ownerToken, { type: 'bearer' });
      expect(loaded.body).toEqual(saved.body);
      expect(loaded.headers['cache-control']).toBe('private, no-store');
      const other = await request(app).get(`${endpoint}?userId=${draftOwner}`).auth(token(otherDraftOwner), { type: 'bearer' });
      expect(other.body).toEqual({ success: true, data: null });
      const impersonated = await request(app).put(endpoint).auth(token(otherDraftOwner), { type: 'bearer' })
        .send({ expectedRevision: null, fields: {}, userId: draftOwner });
      expect(impersonated.status).toBe(400);
      expect(JSON.stringify(impersonated.body)).not.toContain('FIXTURE-ID');
      const conflict = await request(app).put(endpoint).auth(ownerToken, { type: 'bearer' })
        .send({ expectedRevision: null, fields: { businessName: 'Stale tab' } });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('provider_application_draft_conflict');
      expect(conflict.headers['cache-control']).toBe('private, no-store');

      await database.query('UPDATE users SET session_version=2 WHERE id=$1', [draftOwner]);
      expect((await request(app).get(endpoint).auth(ownerToken, { type: 'bearer' })).status).toBe(401);
      await database.query("UPDATE users SET role='provider',session_version=1 WHERE id=$1", [draftOwner]);
      expect((await request(app).get(endpoint).auth(token(draftOwner, 'provider'), { type: 'bearer' })).status).toBe(403);
      await database.query("UPDATE users SET role='customer' WHERE id=$1", [draftOwner]);
      const missingRevision = await request(app).delete(endpoint).auth(ownerToken, { type: 'bearer' }).send({});
      expect(missingRevision.status).toBe(400);
      const discarded = await request(app).delete(endpoint).auth(ownerToken, { type: 'bearer' }).send({ expectedRevision: revision });
      expect(discarded.status).toBe(204);
      expect(discarded.headers['cache-control']).toBe('private, no-store');
      expect(discarded.text).toBe('');
      expect((await request(app).get(endpoint).auth(ownerToken, { type: 'bearer' })).body.data).toBeNull();
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}, 30000);
