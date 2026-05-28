// MED-N77 + MED-N78 fix verified.
//
// MED-N77: payouts above the AML large-transaction threshold (RA 9160
// PH AMLA covered transaction; default PHP 500K = 50,000,000 centavos)
// now enter 'aml_review_pending' status with requires_aml_review=TRUE
// and a snapshot of the threshold value at request time. Super_admin
// clearance via PUT /payouts/:id/clear-aml-review transitions to
// standard 'pending' so the existing approve flow can proceed.
//
// MED-N78: per-method destination account format validation. GCash/
// Maya require 11-digit PH mobile (09XXXXXXXXX); InstaPay/PESONet
// require 8-16 digit account numbers.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const getSettingIntegerMock = jest.fn();
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => getSettingIntegerMock(...args),
}));

jest.mock('../src/services/wallet.service', () => ({
  getUserWallet: jest.fn(async () => ({
    id: 'wallet-1',
    available_balance: '999999999', // plenty for any test
  })),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

import * as payoutService from '../src/services/payout.service';

describe('MED-N78 — destination account format validation', () => {
  it('accepts a valid GCash 09XXXXXXXXX number', () => {
    expect(() => payoutService.validateDestinationAccount('gcash', '09171234567')).not.toThrow();
  });

  it('rejects a GCash number missing the 09 prefix', () => {
    expect(() => payoutService.validateDestinationAccount('gcash', '12345678901'))
      .toThrow(/GCash account must be an 11-digit/);
  });

  it('rejects a GCash number with the wrong length (10 digits)', () => {
    expect(() => payoutService.validateDestinationAccount('gcash', '0917123456'))
      .toThrow(/GCash/);
  });

  it('accepts a valid Maya 09XXXXXXXXX number (same format as GCash)', () => {
    expect(() => payoutService.validateDestinationAccount('maya', '09181112222')).not.toThrow();
  });

  it('accepts an 8-digit InstaPay account', () => {
    expect(() => payoutService.validateDestinationAccount('bank_instapay', '12345678')).not.toThrow();
  });

  it('accepts a 16-digit InstaPay account (upper bound)', () => {
    expect(() => payoutService.validateDestinationAccount('bank_instapay', '1234567890123456')).not.toThrow();
  });

  it('rejects InstaPay with letters (must be all digits)', () => {
    expect(() => payoutService.validateDestinationAccount('bank_instapay', '1234ABCD'))
      .toThrow(/InstaPay/);
  });

  it('rejects InstaPay too short (7 digits)', () => {
    expect(() => payoutService.validateDestinationAccount('bank_instapay', '1234567'))
      .toThrow(/InstaPay/);
  });

  it('rejects PESONet too long (17 digits)', () => {
    expect(() => payoutService.validateDestinationAccount('bank_pesonet', '12345678901234567'))
      .toThrow(/PESONet/);
  });

  it('rejects an unknown payout method', () => {
    expect(() => payoutService.validateDestinationAccount('cryptobro', '09171234567'))
      .toThrow(/Unknown payout method/);
  });
});

describe('MED-N77 — AML threshold detection on requestPayout', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
    getSettingIntegerMock.mockReset();
  });

  function setupHappyPath() {
    // SELECT provider
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] });
    // SELECT pending count
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }] });
  }

  function setupTransaction(amlSnapshot: number, status: string) {
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/UPDATE wallets/.test(sql)) {
          return { rows: [], rowCount: 1 };
        }
        if (/INSERT INTO payouts/.test(sql)) {
          return {
            rows: [{
              id: 'payout-1',
              provider_id: 'provider-1',
              wallet_id: 'wallet-1',
              amount: String(params[2]),
              method: params[3],
              destination_account: params[4],
              account_name: params[5],
              status,
              requires_aml_review: params[8],
              aml_threshold_at_request_centavos: amlSnapshot,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    return txCalls;
  }

  it('payout BELOW the AML threshold gets standard pending status', async () => {
    setupHappyPath();
    getSettingIntegerMock.mockResolvedValueOnce(50_000_000); // PHP 500K threshold
    const txCalls = setupTransaction(50_000_000, 'pending');

    const result = await payoutService.requestPayout('user-1', {
      amount: 25_000_000, // PHP 250K — well below threshold
      method: 'gcash',
      destinationAccount: '09171234567',
    });

    expect(result.status).toBe('pending');
    expect(result.requires_aml_review).toBe(false);
    // Verify INSERT params reflect non-AML status.
    const insert = txCalls.find((c) => /INSERT INTO payouts/.test(c.sql));
    expect(insert!.params[7]).toBe('pending');
    expect(insert!.params[8]).toBe(false);
  });

  it('Bug MED-N77 — payout AT the AML threshold triggers aml_review_pending status (RA 9160 covered)', async () => {
    setupHappyPath();
    getSettingIntegerMock.mockResolvedValueOnce(50_000_000);
    const txCalls = setupTransaction(50_000_000, 'aml_review_pending');

    const result = await payoutService.requestPayout('user-1', {
      amount: 50_000_000, // exactly threshold
      method: 'gcash',
      destinationAccount: '09171234567',
    });

    expect(result.status).toBe('aml_review_pending');
    expect(result.requires_aml_review).toBe(true);
    // Snapshot of threshold MUST be persisted for audit even if the
    // setting changes later.
    const insert = txCalls.find((c) => /INSERT INTO payouts/.test(c.sql));
    expect(insert!.params[9]).toBe(50_000_000);
  });

  it('Bug MED-N77 — payout ABOVE the AML threshold triggers aml_review_pending', async () => {
    setupHappyPath();
    getSettingIntegerMock.mockResolvedValueOnce(50_000_000);
    setupTransaction(50_000_000, 'aml_review_pending');

    const result = await payoutService.requestPayout('user-1', {
      amount: 100_000_000, // PHP 1M
      method: 'bank_instapay',
      destinationAccount: '12345678',
    });

    expect(result.status).toBe('aml_review_pending');
    expect(result.requires_aml_review).toBe(true);
  });

  it('Bug MED-N77 — falls back to RA 9160 default PHP 500K when settings.service is unavailable', async () => {
    setupHappyPath();
    getSettingIntegerMock.mockRejectedValueOnce(new Error('redis + db both down'));
    const txCalls = setupTransaction(50_000_000, 'aml_review_pending');

    const result = await payoutService.requestPayout('user-1', {
      amount: 50_000_000,
      method: 'gcash',
      destinationAccount: '09171234567',
    });

    expect(result.status).toBe('aml_review_pending');
    const insert = txCalls.find((c) => /INSERT INTO payouts/.test(c.sql));
    // Fallback constant PHP 500K = 50,000,000 centavos.
    expect(insert!.params[9]).toBe(50_000_000);
  });

  it('Bug MED-N78 — typoed GCash account is rejected BEFORE wallet is touched', async () => {
    // No setupHappyPath — validation must throw before any DB query.
    await expect(
      payoutService.requestPayout('user-1', {
        amount: 25_000_000,
        method: 'gcash',
        destinationAccount: '917123456', // missing 09 prefix
      }),
    ).rejects.toThrow(/GCash/);
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

describe('MED-N77 — clearAmlReview transitions aml_review_pending → pending', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
  });

  it('clears AML review and writes admin_actions audit row', async () => {
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/UPDATE payouts/.test(sql)) {
          return {
            rows: [{
              id: 'payout-1', provider_id: 'p-1', wallet_id: 'w-1',
              amount: '100000000', method: 'gcash',
              destination_account: '09171234567', status: 'pending',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const result = await payoutService.clearAmlReview('payout-1', 'super-admin-1');
    expect(result.status).toBe('pending');

    // The UPDATE must scope to status='aml_review_pending' so junior
    // admins (or even super_admins) cannot fast-track an already-
    // approved or completed payout via this endpoint.
    const update = txCalls.find((c) => /UPDATE payouts/.test(c.sql));
    expect(update!.sql).toMatch(/status = 'aml_review_pending'/);

    // admin_actions audit row required with the aml_review_cleared
    // action_type literal (which lives in the SQL, not the params).
    const audit = txCalls.find((c) => /admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toMatch(/'aml_review_cleared'/);
  });

  it('throws 404 when the payout is not in aml_review_pending status', async () => {
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async () => ({ rows: [], rowCount: 0 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    await expect(
      payoutService.clearAmlReview('payout-1', 'super-admin-1'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('MED-N77 — payout.routes.ts /:id/clear-aml-review gated by super_admin', () => {

  const { readFileSync } = require('fs');

  const { resolve } = require('path');
  const ROUTES = readFileSync(
    resolve(__dirname, '../src/routes/payout.routes.ts'),
    'utf8',
  );

  it('imports rbacMiddleware', () => {
    expect(ROUTES).toMatch(/import \{ rbacMiddleware \} from '\.\.\/middleware\/rbac\.middleware'/);
  });

  it('PUT /:id/clear-aml-review uses rbacMiddleware(\'super_admin\')', () => {
    const block = ROUTES.match(/router\.put\(\s*'\/:id\/clear-aml-review',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/rbacMiddleware\('super_admin'\)/);
    expect(block![0]).toMatch(/payoutService\.clearAmlReview/);
  });
});
