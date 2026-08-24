jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: jest.fn(),
  getPrivateArtifactStream: jest.fn(),
  deletePrivateArtifact: jest.fn(),
}));

import { convertToCsv } from '../src/services/data-management.service';

it('BUG-UX-177 — CSV data exports include the customer profile and preserve nested wallet history', () => {
  const csv = convertToCsv({
    exportDate: '2026-08-24T00:00:00.000Z',
    user: { id: 'customer-1', first_name: 'Ana', email: '=unsafe@example.test' },
    wallets: [{ id: 'wallet-1', transactions: [{ id: 'tx-1', amount: 5000 }] }],
  });

  expect(csv).toContain('--- user ---');
  expect(csv).toContain('customer-1,Ana,\'=unsafe@example.test');
  expect(csv).toContain('--- wallets ---');
  expect(csv).toContain('"[{""id"":""tx-1"",""amount"":5000}]"');
});
