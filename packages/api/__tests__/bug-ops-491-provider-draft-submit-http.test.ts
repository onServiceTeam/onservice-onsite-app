import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import providerRouter from '../src/routes/provider.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { draftIntegrationIt as it, otherDraftOwner } from './helpers/provider-draft-postgres';
import { applicantId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-491 — apply accepts restored private keys and forwards the draft revision while still requiring fresh agreement acceptance and owned documents', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'application-submit-fixture-secret-not-a-real-credential';
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: applicantId, role: 'customer', sessionVersion: 1, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  try {
    await withSubmissionDatabase(async database => {
      const saved = await request(app).put('/providers/application-draft').auth(token, { type: 'bearer' })
        .send({ expectedRevision: null, fields: submissionInput });
      expect(saved.status).toBe(200);
      expect(saved.body.data.fields.governmentIdFrontUrl).toBe(`onboarding/${applicantId}/front.jpg`);
      const body = { ...saved.body.data.fields, draftRevision: saved.body.data.revision, icAgreementAccepted: true };
      for (const changed of [{ icAgreementAccepted: false }, { draftRevision: 'invalid' },
        { governmentIdFrontUrl: `onboarding/${otherDraftOwner}/front.jpg` },
        { governmentIdBackUrl: 'file:///private/back.jpg' },
        { selfieUrl: `onboarding/${applicantId}/../selfie.jpg` }]) {
        const rejected = await request(app).post('/providers/apply').auth(token, { type: 'bearer' }).send({ ...body, ...changed });
        expect(rejected.status).toBe(400);
        await assertNoSubmission(database);
        expect((await database.query('SELECT revision FROM provider_application_drafts')).rows).toEqual([{ revision: saved.body.data.revision }]);
      }
      const newer = await request(app).put('/providers/application-draft').auth(token, { type: 'bearer' })
        .send({ expectedRevision: saved.body.data.revision, fields: saved.body.data.fields });
      expect(newer.status).toBe(200);
      const stale = await request(app).post('/providers/apply').auth(token, { type: 'bearer' }).send(body);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('provider_application_draft_conflict');
      await assertNoSubmission(database);
      const submitted = await request(app).post('/providers/apply').auth(token, { type: 'bearer' })
        .send({ ...body, draftRevision: newer.body.data.revision });
      expect(submitted.status).toBe(201);
      expect(submitted.body.data).toMatchObject({ userId: applicantId, status: 'pending', city: 'Cebu City', province: 'Cebu' });
      expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual([]);
      expect((await database.query('SELECT ic_agreement_accepted_at FROM providers')).rows)
        .toEqual([{ ic_agreement_accepted_at: expect.any(Date) }]);
      expect((await database.query('SELECT role FROM users')).rows).toEqual([{ role: 'customer' }]);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}, 30000);
