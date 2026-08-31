const dbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));
jest.mock('../src/services/notification.service', () => ({}));

import { publishConsentVersion } from '../src/services/compliance-admin.service';

it('Bug UX-806 — consent publishing rejects a type customer and provider clients cannot acknowledge', async () => {
  await expect(publishConsentVersion({
    adminUserId: '00000000-0000-0000-0000-000000000001',
    consentType: 'invented_policy',
    version: '1.0',
    changeSummary: 'This summary is long enough but targets no supported client consent flow.',
  })).rejects.toMatchObject({ statusCode: 400 });

  expect(dbQuery).not.toHaveBeenCalled();
});
