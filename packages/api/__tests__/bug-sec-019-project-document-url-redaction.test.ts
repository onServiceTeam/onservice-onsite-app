const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({ getPrivateArtifactStream: jest.fn() }));

import { getProjectDetail } from '../src/services/project.service';

it('Bug SEC-019 — project detail never exposes the raw storage or legacy external document URL', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'project-019', customer_id: 'customer-019', provider_id: null, category_id: null,
      title: 'Private plan', description: '', address: null, city: 'Cebu City', status: 'planning',
      estimated_total: null, created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      id: 'document-019', project_id: 'project-019', label: 'Permit image',
      file_url: 'https://tracking.example.test/private-plan.jpg', doc_type: 'permit',
      uploaded_by: 'customer-019', created_at: new Date('2026-09-01'),
    }], rowCount: 1 });

  const detail = await getProjectDetail('project-019', { userId: 'customer-019', role: 'customer' });
  expect(detail.documents).toEqual([expect.objectContaining({
    id: 'document-019',
    fileUrl: null,
    accessPath: '/api/v1/projects/documents/document-019/access',
  })]);
  expect(JSON.stringify(detail)).not.toContain('tracking.example.test');
});
