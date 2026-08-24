// CRIT-N07 regression coverage. Exports must be persisted before a request
// can be marked completed. The storage service now returns an opaque private
// key rather than a public object URL.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const savePrivateArtifactMock = jest.fn();
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: (...args: unknown[]) => savePrivateArtifactMock(...args),
  getPrivateArtifactStream: jest.fn(),
  deletePrivateArtifact: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processDataExport } from '../src/services/data-management.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  savePrivateArtifactMock.mockReset();
  delete process.env.NODE_ENV;
});

describe('CRIT-N07 — processDataExport persists a downloadable artifact', () => {
  it('CRIT-N07 — stores a JSON export privately before marking it completed', async () => {
    // 1. UPDATE data_export_requests SET status = 'processing' RETURNING *
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'export-1',
        user_id: 'user-1',
        status: 'processing',
        format: 'json',
        file_url: null,
        file_size_bytes: null,
        completed_at: null,
        expires_at: null,
        error_message: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });

    // All role-aware archive queries and the final completion update.
    dbQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    savePrivateArtifactMock.mockResolvedValueOnce('private-artifacts/data-exports/user-1/export-1.json');

    await processDataExport('export-1');

    expect(savePrivateArtifactMock).toHaveBeenCalledTimes(1);
    const [buffer, key, contentType] = savePrivateArtifactMock.mock.calls[0]!;
    expect(buffer).toBeInstanceOf(Buffer);
    expect(key).toBe('private-artifacts/data-exports/user-1/export-1.json');
    expect(contentType).toBe('application/json');

    // The database keeps only the opaque private-storage key.
    const completionCall = dbQueryMock.mock.calls.find(
      (c) => /SET status = 'completed'/.test(c[0] as string),
    );
    expect(completionCall).toBeDefined();
    const params = completionCall![1] as unknown[];
    expect(params[0]).toBe('export-1');
    expect(params[1]).toBe('private-artifacts/data-exports/user-1/export-1.json');
    expect(params[2]).toBeGreaterThan(0); // file_size_bytes
  });

  it('CRIT-N07 — persists a CSV export with the correct content type and private key', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'export-2',
        user_id: 'user-2',
        status: 'processing',
        format: 'csv',
        file_url: null,
        file_size_bytes: null,
        completed_at: null,
        expires_at: null,
        error_message: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    savePrivateArtifactMock.mockResolvedValueOnce('private-artifacts/data-exports/user-2/export-2.csv');
    await processDataExport('export-2');

    const [, key, contentType] = savePrivateArtifactMock.mock.calls[0]!;
    expect(key).toBe('private-artifacts/data-exports/user-2/export-2.csv');
    expect(contentType).toBe('text/csv');
  });

  it('CRIT-N07 — a storage failure records a failed request and never marks it completed', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'export-3',
        user_id: 'user-3',
        status: 'processing',
        format: 'json',
        file_url: null,
        file_size_bytes: null,
        completed_at: null,
        expires_at: null,
        error_message: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    savePrivateArtifactMock.mockRejectedValueOnce(new Error('Private export storage unavailable'));

    await processDataExport('export-3');

    // Should NOT have run the completion UPDATE.
    const completionCall = dbQueryMock.mock.calls.find(
      (c) => /SET status = 'completed'/.test(c[0] as string),
    );
    expect(completionCall).toBeUndefined();

    // Should have run the failure UPDATE.
    const failureCall = dbQueryMock.mock.calls.find(
      (c) => /SET status = 'failed'/.test(c[0] as string),
    );
    expect(failureCall).toBeDefined();
    const params = failureCall![1] as unknown[];
    expect(params[1]).toMatch(/Private export storage unavailable/);
  });
});
