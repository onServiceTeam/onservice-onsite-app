const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: jest.fn().mockResolvedValue('private-artifacts/data-exports/user-1/export-1.json'),
  getPrivateArtifactStream: jest.fn(),
  deletePrivateArtifact: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processDataExport } from '../src/services/data-management.service';

it('BUG-UX-187 — a stale processing export is reclaimed through an exclusive one-hour lease', async () => {
  dbQueryMock.mockImplementationOnce(async (sql: string) => {
    expect(sql).toContain("status = 'processing'");
    expect(sql).toContain("processing_started_at <= NOW() - INTERVAL '1 hour'");
    return {
      rows: [{
        id: 'export-1', user_id: 'user-1', status: 'processing', format: 'json',
        file_url: null, file_size_bytes: null, completed_at: null, expires_at: null,
        error_message: null, processing_started_at: new Date(0), created_at: new Date(0),
      }],
      rowCount: 1,
    };
  });
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });

  await processDataExport('export-1');

  expect(dbQueryMock.mock.calls.some((call) => /SET status = 'completed'/.test(call[0] as string))).toBe(true);
});
