const queryMock = jest.fn();
const transactionMock = jest.fn();
const settingMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (cb: unknown) => transactionMock(cb),
  },
}));
jest.mock('../src/services/settings.service', () => ({ getSettingInteger: (...args: unknown[]) => settingMock(...args) }));
jest.mock('../src/services/wallet.service', () => ({
  getUserWallet: jest.fn().mockResolvedValue({ id: 'wallet-1', available_balance: '60000000' }),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { requestPayout } from '../src/services/payout.service';

it('BUG-UX-184 — an unsafe high threshold cannot bypass review of a ₱500,000 payout', async () => {
  settingMock.mockResolvedValueOnce(100_000_000);
  queryMock.mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (cb: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
        if (sql.includes('UPDATE wallets')) return { rows: [], rowCount: 1 };
        if (sql.includes('INSERT INTO payouts')) {
          return { rows: [{
            id: 'payout-1', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '50000000',
            method: 'gcash', destination_account: '09171234567', account_name: null,
            status: params[7], requires_aml_review: params[8], aml_threshold_at_request_centavos: params[9],
          }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return (cb as (value: typeof client) => Promise<unknown>)(client);
  });

  const result = await requestPayout('provider-user-1', {
    amount: 50_000_000,
    method: 'gcash',
    destinationAccount: '09171234567',
  });

  expect(result.status).toBe('aml_review_pending');
  const insert = calls.find((call) => call.sql.includes('INSERT INTO payouts'));
  expect(insert?.params[8]).toBe(true);
  expect(insert?.params[9]).toBe(50_000_000);
});
