const dbQueryMock = jest.fn();
const validateFileMock = jest.fn().mockResolvedValue(undefined);
const saveUploadedFileMock = jest.fn().mockResolvedValue({
  id: 'stored-017',
  url: 'https://storage.example.test/private-artifacts/customer-017/stored-017.jpg',
  filename: 'private-artifacts/customer-017/stored-017.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 4,
});
const deletePrivateArtifactMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/services/upload.service', () => ({
  validateFile: (...args: unknown[]) => validateFileMock(...args),
  saveUploadedFile: (...args: unknown[]) => saveUploadedFileMock(...args),
  deletePrivateArtifact: (...args: unknown[]) => deletePrivateArtifactMock(...args),
  getPrivateArtifactStream: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { uploadPrivateDocument } from '../src/services/project.service';

const project = {
  id: 'project-017', customer_id: 'customer-017', provider_id: null, category_id: null,
  title: 'Private plan', description: '', address: null, city: 'Cebu City', status: 'planning',
  estimated_total: null, created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01'),
};

it('Bug SEC-017 — private project uploads are customer-owner-only and persist an opaque encrypted-storage key', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [project], rowCount: 1 });
  await expect(uploadPrivateDocument('project-017', { userId: 'admin-017', role: 'admin' }, {
    label: 'Override', docType: 'other', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    originalname: 'override.jpg', mimetype: 'image/jpeg', size: 4,
  })).rejects.toMatchObject({ statusCode: 403 });
  expect(saveUploadedFileMock).not.toHaveBeenCalled();

  dbQueryMock.mockReset();
  dbQueryMock
    .mockResolvedValueOnce({ rows: [project], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'document-017', project_id: 'project-017', label: 'Ground-floor plan',
      file_url: 'private-artifacts/customer-017/stored-017.jpg', doc_type: 'blueprint',
      uploaded_by: 'customer-017', created_at: new Date('2026-09-01'),
    }], rowCount: 1 });

  const saved = await uploadPrivateDocument('project-017', { userId: 'customer-017', role: 'customer' }, {
    label: 'Ground-floor plan', docType: 'blueprint', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    originalname: 'plan.jpg', mimetype: 'image/jpeg', size: 4,
  });
  expect(saveUploadedFileMock).toHaveBeenCalledWith(
    expect.any(Buffer), 'plan.jpg', 'image/jpeg', 'customer-017', 'private-artifacts', 'private',
  );
  const insert = dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO project_documents'));
  expect(insert?.[1]).toEqual([
    'project-017', 'Ground-floor plan', 'private-artifacts/customer-017/stored-017.jpg', 'blueprint', 'customer-017',
  ]);
  expect(saved).toMatchObject({ fileUrl: null, accessPath: '/api/v1/projects/documents/document-017/access' });
  expect(deletePrivateArtifactMock).not.toHaveBeenCalled();
});
