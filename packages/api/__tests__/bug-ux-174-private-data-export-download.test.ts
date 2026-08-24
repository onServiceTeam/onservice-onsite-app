const queryMock = jest.fn();
const getPrivateArtifactStreamMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: jest.fn(),
  getPrivateArtifactStream: (...args: unknown[]) => getPrivateArtifactStreamMock(...args),
  deleteUploadedFile: jest.fn(),
}));

import { createDataExportDownloadLink, getDataExportDownload } from '../src/services/data-management.service';

it('BUG-UX-174 — an authorized export download uses a short-lived token and keeps the storage key private', async () => {
  process.env.DATA_EXPORT_DOWNLOAD_SECRET = 'test-export-secret-at-least-32-characters';
  const row = {
    id: 'export-1', user_id: 'customer-1', status: 'completed', format: 'json',
    file_url: 'private-artifacts/data-exports/customer-1/export-1.json', file_size_bytes: 100,
    completed_at: new Date(), expires_at: new Date(Date.now() + 60_000), error_message: null, created_at: new Date(),
  };
  queryMock
    .mockResolvedValueOnce({ rows: [row] })
    .mockResolvedValueOnce({ rows: [row] })
    .mockResolvedValueOnce({ rows: [row] });
  const stream = { body: { pipe: jest.fn() }, contentType: 'application/json', contentLength: 100 };
  getPrivateArtifactStreamMock.mockResolvedValueOnce(stream);

  const link = await createDataExportDownloadLink('customer-1', 'export-1');
  expect(link.url).not.toContain('private-artifacts/data-exports/customer-1');
  const parsed = new URL(`https://api.test${link.url}`);

  await expect(getDataExportDownload(
    'export-1', Number(parsed.searchParams.get('expires')), parsed.searchParams.get('token') ?? '',
  )).resolves.toEqual({ stream, filename: 'onservice-data-export-export-1.json' });
  expect(getPrivateArtifactStreamMock).toHaveBeenCalledWith('private-artifacts/data-exports/customer-1/export-1.json');
});
