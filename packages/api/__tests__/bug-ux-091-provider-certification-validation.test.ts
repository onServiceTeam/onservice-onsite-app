import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'provider',
    };
    next();
  },
}));

const mockAddCertification = jest.fn();
jest.mock('../src/services/provider.service', () => ({
  getProviderByUserId: jest.fn().mockResolvedValue({ id: 'provider-1' }),
  addCertification: (...args: unknown[]) => mockAddCertification(...args),
  formatCertification: (row: unknown) => row,
}));

jest.mock('../src/services/upload.service', () => ({
  extractObjectKey: (value: string) => new URL(value).pathname.replace(/^\/(?:uploads\/)?/, ''),
}));

import providerRouter from '../src/routes/provider.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-091 — certification route rejects impossible dates and foreign uploads while passing a normalized valid credential', async () => {
  mockAddCertification.mockResolvedValue({ id: 'cert-1' });
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);
  app.use(errorMiddleware);

  const impossibleDate = await request(app).post('/providers/me/certifications').send({
    name: 'NC II',
    issuedDate: '2026-02-31',
  });
  expect(impossibleDate.status).toBe(400);
  expect(impossibleDate.body.error.details[0].message).toMatch(/real calendar date/i);
  expect(mockAddCertification).not.toHaveBeenCalled();

  const foreignUpload = await request(app).post('/providers/me/certifications').send({
    name: 'NC II',
    certificateUrl: 'https://files.example/onboarding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cert.jpg',
  });
  expect(foreignUpload.status).toBe(400);
  expect(foreignUpload.body.error.message).toMatch(/uploaded from this account/i);
  expect(mockAddCertification).not.toHaveBeenCalled();

  const valid = await request(app).post('/providers/me/certifications').send({
    name: '  Electrical Installation NC II  ',
    issuingBody: '  TESDA  ',
    certificateNumber: '',
    certificateUrl: 'https://files.example/onboarding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cert.jpg',
    issuedDate: '2025-02-28',
    expiryDate: '2030-02-28',
  });
  expect(valid.status).toBe(201);
  expect(mockAddCertification).toHaveBeenCalledWith('provider-1', {
    name: 'Electrical Installation NC II',
    issuingBody: 'TESDA',
    certificateNumber: null,
    certificateUrl: 'https://files.example/onboarding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cert.jpg',
    issuedDate: '2025-02-28',
    expiryDate: '2030-02-28',
  });
});
