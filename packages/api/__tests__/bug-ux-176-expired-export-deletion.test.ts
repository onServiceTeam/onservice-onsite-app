const queryMock = jest.fn();
const deletePrivateArtifactMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: jest.fn(),
  getPrivateArtifactStream: jest.fn(),
  deletePrivateArtifact: (...args: unknown[]) => deletePrivateArtifactMock(...args),
}));

import { expireOldExports } from '../src/services/data-management.service';

it('BUG-UX-176 — expiring a data export deletes its private artifact and clears the stored key', async () => {
  const row = { id: 'export-1', file_url: 'private-artifacts/data-exports/customer-1/export-1.json' };
  queryMock
    .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [row] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  deletePrivateArtifactMock.mockResolvedValueOnce(undefined);

  await expect(expireOldExports()).resolves.toBe(1);
  expect(deletePrivateArtifactMock).toHaveBeenCalledWith('private-artifacts/data-exports/customer-1/export-1.json');
  expect(queryMock.mock.calls[2]![0]).toContain('SET file_url = NULL');
});
