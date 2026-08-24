const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({}));

import { createDataExportDownloadLink } from '../src/services/data-management.service';

it('Bug OPS-226 — JWT signing material cannot be reused for private export links', async () => {
  const previousExportSecret = process.env.DATA_EXPORT_DOWNLOAD_SECRET;
  const previousJwtSecret = process.env.JWT_SECRET;
  delete process.env.DATA_EXPORT_DOWNLOAD_SECRET;
  process.env.JWT_SECRET = 'jwt-secret-that-must-not-sign-private-exports';
  queryMock.mockResolvedValueOnce({ rows: [{
    id: 'export-1', user_id: 'customer-1', status: 'completed', format: 'json',
    file_url: 'private-artifacts/data-exports/customer-1/export-1.json',
    expires_at: new Date(Date.now() + 60_000),
  }] });

  try {
    await expect(createDataExportDownloadLink('customer-1', 'export-1'))
      .rejects.toMatchObject({ statusCode: 503 });
  } finally {
    if (previousExportSecret === undefined) delete process.env.DATA_EXPORT_DOWNLOAD_SECRET;
    else process.env.DATA_EXPORT_DOWNLOAD_SECRET = previousExportSecret;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});
