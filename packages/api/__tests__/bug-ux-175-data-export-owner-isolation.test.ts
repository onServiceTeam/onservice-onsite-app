const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({ savePrivateArtifact: jest.fn(), getPrivateArtifactStream: jest.fn() }));

import { createDataExportDownloadLink } from '../src/services/data-management.service';

it('BUG-UX-175 — a user cannot mint a download link for another user’s export', async () => {
  process.env.JWT_SECRET = 'test-export-secret-at-least-32-characters';
  queryMock.mockResolvedValueOnce({ rows: [] });

  await expect(createDataExportDownloadLink('attacker-user', 'victim-export')).rejects.toThrow('Data export not found.');
  expect(queryMock.mock.calls[0]![1]).toEqual(['victim-export', 'attacker-user']);
});
