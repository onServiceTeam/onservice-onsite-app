// CRIT-N07 fix verified — processDataExport actually uploads to S3 and
// stores the URL. Pre-fix: marked "completed" with file_url=NULL.
// NPC RA 10173 violation (right-to-portability requires actual delivery).

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const uploadBirDocumentMock = jest.fn();
jest.mock('../src/utils/s3-bir', () => ({
  uploadBirDocument: (...args: unknown[]) => uploadBirDocumentMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processDataExport } from '../src/services/data-management.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  uploadBirDocumentMock.mockReset();
  delete process.env.NODE_ENV;
});

describe('CRIT-N07 — processDataExport actually uploads to S3', () => {
  it('CRIT-N07 — uploads JSON export to S3 and stores file_url', async () => {
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

    // 2-7. gatherUserData makes 6 SELECTs.
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }

    // S3 upload returns a real URL.
    uploadBirDocumentMock.mockResolvedValueOnce({
      bucket: 'test-bucket',
      region: 'ap-southeast-1',
      key: 'data-exports/user-1/export-1.json',
      url: 'https://test-bucket.s3.ap-southeast-1.amazonaws.com/data-exports/user-1/export-1.json',
    });

    // 8. UPDATE data_export_requests SET status = 'completed', file_url = $2 ...
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processDataExport('export-1');

    // S3 was called with the right shape.
    expect(uploadBirDocumentMock).toHaveBeenCalledTimes(1);
    const [buffer, key, contentType] = uploadBirDocumentMock.mock.calls[0]!;
    expect(buffer).toBeInstanceOf(Buffer);
    expect(key).toBe('data-exports/user-1/export-1.json');
    expect(contentType).toBe('application/json');

    // The completion UPDATE includes the file_url from S3.
    const completionCall = dbQueryMock.mock.calls.find(
      (c) => /SET status = 'completed'/.test(c[0] as string),
    );
    expect(completionCall).toBeDefined();
    const params = completionCall![1] as unknown[];
    expect(params[0]).toBe('export-1');
    expect(params[1]).toBe(
      'https://test-bucket.s3.ap-southeast-1.amazonaws.com/data-exports/user-1/export-1.json',
    );
    expect(params[2]).toBeGreaterThan(0); // file_size_bytes
  });

  it('CRIT-N07 — uploads CSV export with text/csv content type and .csv key', async () => {
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
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }
    uploadBirDocumentMock.mockResolvedValueOnce({
      bucket: 'test-bucket',
      region: 'ap-southeast-1',
      key: 'data-exports/user-2/export-2.csv',
      url: 'https://test-bucket.s3.ap-southeast-1.amazonaws.com/data-exports/user-2/export-2.csv',
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processDataExport('export-2');

    const [, key, contentType] = uploadBirDocumentMock.mock.calls[0]!;
    expect(key).toBe('data-exports/user-2/export-2.csv');
    expect(contentType).toBe('text/csv');
  });

  it('CRIT-N07 — production fails the request when S3 is not configured', async () => {
    process.env.NODE_ENV = 'production';

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
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }

    // S3 returns null (unconfigured).
    uploadBirDocumentMock.mockResolvedValueOnce(null);

    // The error path UPDATE.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

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
    expect(params[1]).toMatch(/S3 not configured/);
  });

  it('CRIT-N07 — non-production allows null file_url (dev/test parity)', async () => {
    process.env.NODE_ENV = 'test';

    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'export-4',
        user_id: 'user-4',
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
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }

    // S3 unconfigured in test → returns null.
    uploadBirDocumentMock.mockResolvedValueOnce(null);

    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processDataExport('export-4');

    // Completion UPDATE ran with file_url=null.
    const completionCall = dbQueryMock.mock.calls.find(
      (c) => /SET status = 'completed'/.test(c[0] as string),
    );
    expect(completionCall).toBeDefined();
    const params = completionCall![1] as unknown[];
    expect(params[1]).toBeNull();
  });
});
