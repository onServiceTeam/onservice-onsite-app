import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import authRouter from '../src/routes/auth.routes';
import providerRouter from '../src/routes/provider.routes';
import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { sendOtpSms } from '../src/services/sms.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, submissionInput } from './helpers/provider-submission-postgres';
import { approvalReview } from './helpers/provider-approval-postgres';
import { reviewerId, withReviewHandoffDatabase } from './helpers/provider-review-handoff-postgres';

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
  getOtpPolicy: jest.fn().mockResolvedValue({ length: 6, expiryMinutes: 5, maxAttempts: 3, cooldownSeconds: 60 }),
}));
// No SMS or security-provider traffic. OTP generation, hashing, consume,
// account lookup, JWT issuance, refresh rotation and role checks remain real.
jest.mock('../src/services/sms.service', () => ({ sendOtpSms: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/services/security.service', () => ({
  checkOtpLockout: jest.fn().mockResolvedValue({ locked: false, captchaRequired: false }),
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
  registerDeviceFingerprint: jest.fn().mockResolvedValue({ isNewDevice: false }),
}));

it('Bug OPS-494 — approval rejects both old customer credentials and only a fresh consumed OTP issues provider authority for that same account', async () => {
  const previous = { JWT_SECRET: process.env.JWT_SECRET, ALLOW_DEV_OTP: process.env.ALLOW_DEV_OTP };
  process.env.JWT_SECRET = 'fresh-sign-in-test-only-not-a-real-credential';
  process.env.ALLOW_DEV_OTP = '0';
  const phone = '+639170000001';
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/providers', providerRouter);
  app.use('/api/v1/admin', adminLatentRouter);
  app.use(errorMiddleware);
  const otp = () => jest.mocked(sendOtpSms).mock.calls.at(-1)![1];
  const send = () => request(app).post('/api/v1/auth/send-otp').send({ phone });
  const verify = (code: string) => request(app).post('/api/v1/auth/verify-otp').send({ phone, code });
  const refresh = (refreshToken: string) => request(app).post('/api/v1/auth/refresh-token').send({ refreshToken });
  try {
    await withReviewHandoffDatabase(async database => {
      await database.query(`ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT NOW();
        ALTER TABLE refresh_tokens ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          ADD COLUMN token_hash text UNIQUE, ADD COLUMN expires_at timestamptz,
          ADD COLUMN device_fingerprint text, ADD COLUMN created_ip inet;
        CREATE TABLE otp_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text NOT NULL,
          code text, code_hash text, attempts integer NOT NULL DEFAULT 0, is_used boolean NOT NULL DEFAULT FALSE,
          expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW());`);
      await database.query('UPDATE users SET phone=$1 WHERE id=$2', [phone, applicantId]);
      expect((await send()).status).toBe(200);
      const customer = await verify(otp());
      expect(customer.status).toBe(200);
      expect(customer.body.data.user).toMatchObject({ id: applicantId, role: 'customer' });
      // Establish that these persisted credentials genuinely rotate before approval.
      const rotated = await refresh(customer.body.data.refreshToken);
      expect(rotated.status).toBe(200);
      const access = rotated.body.data.accessToken as string;
      const oldRefresh = rotated.body.data.refreshToken as string;
      const draft = await request(app).put('/api/v1/providers/application-draft').auth(access, { type: 'bearer' })
        .send({ expectedRevision: null, fields: submissionInput });
      expect(draft.status).toBe(200);
      const submission = await request(app).post('/api/v1/providers/apply').auth(access, { type: 'bearer' })
        .send({ ...draft.body.data.fields, draftRevision: draft.body.data.revision, icAgreementAccepted: true });
      expect(submission.status).toBe(201);
      const providerId = submission.body.data.id;
      const revisionId = (await database.query('SELECT id FROM provider_application_revisions WHERE provider_id=$1', [providerId])).rows[0].id;
      const admin = jwt.sign({ userId: reviewerId, role: 'super_admin', sessionVersion: 1 }, process.env.JWT_SECRET!, { expiresIn: '5m' });
      const approved = await request(app).post(`/api/v1/admin/provider-applications/${applicantId}/decide`)
        .auth(admin, { type: 'bearer' }).send({ decision: 'approved', ...approvalReview, expectedRevisionId: revisionId });
      expect(approved.status).toBe(200);
      const staleAccess = await request(app).get('/api/v1/providers/application-status').auth(access, { type: 'bearer' });
      expect(staleAccess.status).toBe(401);
      const countBefore = (await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows;
      const staleRefresh = await refresh(oldRefresh);
      expect(staleRefresh.status).toBe(401);
      expect(staleRefresh.body.error.message).toContain('sign in again');
      expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual(countBefore);
      expect((await send()).status).toBe(200);
      const code = otp();
      const wrongCode = code === '000000' ? '111111' : '000000';
      expect((await verify(wrongCode)).status).toBe(400);
      const provider = await verify(code);
      expect(provider.status).toBe(200);
      expect(provider.body.data.user).toMatchObject({ id: applicantId, role: 'provider' });
      expect(provider.body.data.isNewUser).toBe(false);
      expect(jwt.verify(provider.body.data.accessToken, process.env.JWT_SECRET!)).toMatchObject({ userId: applicantId, role: 'provider' });
      expect((await verify(code)).status).toBe(400);
      const me = await request(app).get('/api/v1/auth/me').auth(provider.body.data.accessToken, { type: 'bearer' });
      expect(me.status).toBe(200);
      expect(me.body.data).toMatchObject({ id: applicantId, role: 'provider' });
      const status = await request(app).get('/api/v1/providers/application-status').auth(provider.body.data.accessToken, { type: 'bearer' });
      expect(status.status).toBe(200);
      expect(status.body.data).toEqual({ status: 'approved', rejectionReason: null });
      expect((await refresh(provider.body.data.refreshToken)).status).toBe(200);
      expect((await database.query('SELECT id,user_id,status FROM providers')).rows).toEqual([{ id: providerId, user_id: applicantId, status: 'approved' }]);
      expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows).toEqual([{ count: 1 }]);
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}, 30000);
