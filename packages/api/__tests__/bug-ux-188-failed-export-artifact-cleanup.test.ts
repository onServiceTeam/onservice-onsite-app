const dbQueryMock = jest.fn();
const savePrivateArtifactMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: (...args: unknown[]) => savePrivateArtifactMock(...args),
  getPrivateArtifactStream: jest.fn(),
  deletePrivateArtifact: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processDataExport } from '../src/services/data-management.service';

it('BUG-UX-188 — a stored artifact is retained for cleanup when the completion update fails', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'export-1', user_id: 'user-1', status: 'processing', format: 'json',
      file_url: null, file_size_bytes: null, completed_at: null, expires_at: null,
      error_message: null, processing_started_at: new Date(), created_at: new Date(),
    }],
    rowCount: 1,
  });
  savePrivateArtifactMock.mockResolvedValue('private-artifacts/data-exports/user-1/export-1.json');

  let completionRejected = false;
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (/SET status = 'completed'/.test(sql) && !completionRejected) {
      completionRejected = true;
      throw new Error('database write failed');
    }
    return { rows: [], rowCount: 1 };
  });

  await processDataExport('export-1');

  const failureCall = dbQueryMock.mock.calls.find((call) => /SET status = 'failed'/.test(call[0] as string));
  expect(failureCall?.[1]).toEqual([
    'export-1',
    'database write failed',
    'private-artifacts/data-exports/user-1/export-1.json',
  ]);
});
