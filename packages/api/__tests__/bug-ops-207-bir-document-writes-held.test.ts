const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { issueOR } from '../src/services/or.service';

const originalNodeEnv = process.env.NODE_ENV;
const originalIssuanceFlag = process.env.BIR_DOCUMENT_ISSUANCE_ENABLED;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalIssuanceFlag === undefined) {
    delete process.env.BIR_DOCUMENT_ISSUANCE_ENABLED;
  } else {
    process.env.BIR_DOCUMENT_ISSUANCE_ENABLED = originalIssuanceFlag;
  }
});

it('Bug OPS-207 — deployed environments cannot issue BIR-labelled documents while E22 is open', async () => {
  process.env.NODE_ENV = 'staging';
  // A configuration typo must not bypass a legal/compliance hard stop.
  process.env.BIR_DOCUMENT_ISSUANCE_ENABLED = '1';

  await expect(issueOR({
    bookingId: 'booking-1',
    commissionAmount: 100,
    serviceFeeAmount: 100,
    providerReceived: 800,
    platformRetained: 200,
  })).rejects.toMatchObject({
    statusCode: 503,
    message: expect.stringMatching(/BIR document generation is disabled.*E22/i),
  });
  expect(dbQueryMock).not.toHaveBeenCalled();
});
