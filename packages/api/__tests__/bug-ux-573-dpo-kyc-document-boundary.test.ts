const dbQuery = jest.fn();
const getObjectStream = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));
jest.mock('../src/services/upload.service', () => ({
  getObjectStream: (...args: unknown[]) => getObjectStream(...args),
}));

import { getProviderKycDocumentStream } from '../src/services/kyc-document.service';

it('Bug UX-573 — a privacy-only DPO identity cannot read provider KYC documents', async () => {
  dbQuery.mockResolvedValue({
    rows: [{
      id: 'provider-573',
      user_id: 'provider-user-573',
      government_id_front_url: 'private/provider-573/front.jpg',
      government_id_back_url: null,
      nbi_clearance_url: null,
      selfie_url: null,
    }],
  });

  await expect(getProviderKycDocumentStream({
    providerId: 'provider-573',
    docType: 'government_id_front',
    requesterUserId: 'dpo-573',
    requesterRole: 'dpo',
  })).rejects.toMatchObject({ statusCode: 403 });
  expect(getObjectStream).not.toHaveBeenCalled();
});
