const dbQueryMock = jest.fn();
const getPrivateArtifactStreamMock = jest.fn().mockResolvedValue({
  body: { pipe: jest.fn() }, contentType: 'image/jpeg', contentLength: 123,
});

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/services/upload.service', () => ({
  getPrivateArtifactStream: (...args: unknown[]) => getPrivateArtifactStreamMock(...args),
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { createDocumentAccessLink, getDocumentDownload } from '../src/services/project.service';

const document = {
  id: 'document-018', project_id: 'project-018', label: 'Ground plan',
  file_url: 'private-artifacts/customer-018/file.jpg', doc_type: 'blueprint',
  uploaded_by: 'customer-018', created_at: new Date('2026-09-01'),
};
const project = {
  id: 'project-018', customer_id: 'customer-018', provider_id: 'provider-018', category_id: null,
  title: 'Private plan', description: '', address: null, city: 'Cebu City', status: 'planning',
  estimated_total: null, created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01'),
};

it('Bug SEC-018 — a legacy provider cannot mint a project-document link while the owner gets a tamper-evident short-lived download', async () => {
  process.env.DATA_EXPORT_DOWNLOAD_SECRET = 'project-document-test-secret-017890123456789';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [document], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [project], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-018' }], rowCount: 1 });
  await expect(createDocumentAccessLink('document-018', { userId: 'provider-user-018', role: 'provider' }))
    .rejects.toMatchObject({ statusCode: 403 });

  dbQueryMock.mockReset();
  dbQueryMock
    .mockResolvedValueOnce({ rows: [document], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [project], rowCount: 1 });
  const access = await createDocumentAccessLink('document-018', { userId: 'customer-018', role: 'customer' });
  expect(access.expiresInSeconds).toBe(120);
  expect(access.url).not.toContain('private-artifacts');
  const parsed = new URL(access.url, 'https://api.example.test');
  const expires = Number(parsed.searchParams.get('expires'));
  const token = parsed.searchParams.get('token') ?? '';

  await expect(getDocumentDownload('document-018', expires, `${token}tampered`))
    .rejects.toMatchObject({ statusCode: 403 });
  dbQueryMock.mockResolvedValueOnce({ rows: [document], rowCount: 1 });
  const download = await getDocumentDownload('document-018', expires, token);
  expect(getPrivateArtifactStreamMock).toHaveBeenCalledWith('private-artifacts/customer-018/file.jpg');
  expect(download).toMatchObject({ filename: 'Ground-plan.jpg', stream: { contentType: 'image/jpeg' } });
});
