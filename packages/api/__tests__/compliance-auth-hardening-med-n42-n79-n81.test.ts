const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { recordConsent } from '../src/services/compliance.service';

it('MED-N42 - a failed revocation-history insert leaves the prior consent active', async () => {
  const state = { priorConsentRevoked: false, revocationEventStored: false };
  dbQueryMock.mockRejectedValue(new Error('recordConsent must not write outside its transaction'));
  dbTransactionMock.mockImplementation(async (
    callback: (client: { query: jest.Mock }) => Promise<unknown>,
  ) => {
    const snapshot = { ...state };
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('UPDATE consent_records')) {
          state.priorConsentRevoked = true;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO consent_records')) {
          throw new Error('simulated revocation history insert failure');
        }
        throw new Error(`Unexpected consent query: ${sql}`);
      }),
    };
    try {
      const result = await callback(client);
      state.revocationEventStored = true;
      return result;
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  });

  await expect(recordConsent({
    userId: 'user-med-n42',
    consentType: 'marketing_consent',
    version: 'v2',
    granted: false,
    ipAddress: '203.0.113.42',
    userAgent: 'onService test client',
  })).rejects.toThrow('simulated revocation history insert failure');

  expect(state).toEqual({ priorConsentRevoked: false, revocationEventStored: false });
  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).not.toHaveBeenCalled();
});
